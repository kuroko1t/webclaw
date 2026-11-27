import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockAttach = vi.fn();
const mockDetach = vi.fn();
const mockSendCommand = vi.fn();
const onEventListeners: Array<
  (source: chrome.debugger.Debuggee, method: string, params?: object) => void
> = [];

vi.stubGlobal('chrome', {
  debugger: {
    attach: mockAttach,
    detach: mockDetach,
    sendCommand: mockSendCommand,
    onEvent: { addListener: vi.fn((cb: (typeof onEventListeners)[0]) => onEventListeners.push(cb)) },
    onDetach: { addListener: vi.fn() },
  },
});

import {
  typeWithDebugger,
  TrustedInputError,
  COMMAND_TIMEOUT_MS,
  CLEANUP_TIMEOUT_MS,
} from '../background/trusted-input';
import { DialogHandler } from '../background/dialog-handler';

/** CDP commands sent, as "Method" or "Method:type" for key events */
function sentCommands(): string[] {
  return mockSendCommand.mock.calls.map(([, method, params]) => {
    const p = params as { type?: string; text?: string; key?: string; enabled?: boolean } | undefined;
    if (method === 'Input.dispatchKeyEvent') return `key:${p?.type}:${p?.key}`;
    if (method === 'Input.insertText') return `text:${p?.text}`;
    if (method === 'Emulation.setFocusEmulationEnabled') return `focus:${p?.enabled}`;
    return method as string;
  });
}

describe('typeWithDebugger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    onEventListeners.length = 0;
    mockAttach.mockResolvedValue(undefined);
    mockDetach.mockResolvedValue(undefined);
    mockSendCommand.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('attaches, sends text and keys in order, and detaches', async () => {
    const done = typeWithDebugger(1, 'a\nb\tc', { commaAsKey: false });
    await vi.runAllTimersAsync();
    await done;

    expect(mockAttach).toHaveBeenCalledWith({ tabId: 1 }, '1.3');
    expect(sentCommands()).toEqual([
      'focus:true',
      'text:a',
      'key:keyDown:Enter',
      'key:keyUp:Enter',
      'text:b',
      'key:rawKeyDown:Tab',
      'key:keyUp:Tab',
      'text:c',
      'focus:false',
    ]);
    expect(mockDetach).toHaveBeenCalledWith({ tabId: 1 });
    expect(mockAttach.mock.invocationCallOrder[0]).toBeLessThan(
      mockSendCommand.mock.invocationCallOrder[0]
    );
    expect(mockDetach.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockSendCommand.mock.invocationCallOrder.at(-1)!
    );
  });

  it('sends commas as keys only with commaAsKey', async () => {
    const done = typeWithDebugger(1, 'x,y', { commaAsKey: true });
    await vi.runAllTimersAsync();
    await done;
    expect(sentCommands()).toContain('key:keyDown:,');
    expect(sentCommands()).toContain('text:y');
  });

  it('does not wait between plain text runs', async () => {
    // Only text: no timers are needed to finish
    await typeWithDebugger(1, 'plain', { commaAsKey: false });
    expect(sentCommands()).toEqual(['focus:true', 'text:plain', 'focus:false']);
  });

  it('reports an attach failure with phase "attach" and sends nothing', async () => {
    mockAttach.mockRejectedValue(new Error('Another debugger is already attached'));
    const err = await typeWithDebugger(1, 'a\n', { commaAsKey: false }).catch((e) => e);
    expect(err).toBeInstanceOf(TrustedInputError);
    expect(err.phase).toBe('attach');
    expect(mockSendCommand).not.toHaveBeenCalled();
    expect(mockDetach).not.toHaveBeenCalled();
  });

  it('detaches and reports progress when a command fails part way', async () => {
    mockSendCommand.mockImplementation(async (_t: unknown, method: string, params?: { type?: string }) => {
      if (method === 'Input.dispatchKeyEvent' && params?.type === 'rawKeyDown') {
        throw new Error('Target crashed');
      }
    });
    const done = typeWithDebugger(1, 'ab\ncd\tef', { commaAsKey: false }).catch((e) => e);
    await vi.runAllTimersAsync();
    const err = await done;
    expect(err).toBeInstanceOf(TrustedInputError);
    expect(err.phase).toBe('input');
    // "ab", Enter, "cd" were sent before Tab failed
    expect(err.sentChars).toBe(5);
    expect(err.totalChars).toBe(8);
    expect(err.message).toContain('5 of 8 characters');
    expect(err.message).toContain('Target crashed');
    expect(mockDetach).toHaveBeenCalledWith({ tabId: 1 });
  });

  it('times out a key event that never returns and still detaches', async () => {
    mockSendCommand.mockImplementation((_t: unknown, method: string, params?: { type?: string }) => {
      if (method === 'Input.dispatchKeyEvent' && params?.type === 'keyDown') {
        return new Promise(() => {}); // blocked, e.g. by an alert()
      }
      return Promise.resolve(undefined);
    });
    const done = typeWithDebugger(1, 'a\n', { commaAsKey: false }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(COMMAND_TIMEOUT_MS + 10);
    const err = await done;
    expect(err).toBeInstanceOf(TrustedInputError);
    expect(err.phase).toBe('input');
    expect(err.message).toContain('handle_dialog');
    expect(mockDetach).toHaveBeenCalledTimes(1);
  });

  it('does not wait another full command timeout for the cleanup while a dialog blocks', async () => {
    // A dialog blocks every command, including the focus emulation reset.
    mockSendCommand.mockImplementation((_t: unknown, method: string, params?: { type?: string }) => {
      if (method === 'Input.dispatchKeyEvent' && params?.type === 'keyDown') return new Promise(() => {});
      if (method === 'Emulation.setFocusEmulationEnabled' && mockSendCommand.mock.calls.length > 1) {
        return new Promise(() => {});
      }
      return Promise.resolve(undefined);
    });
    let settled = false;
    const done = typeWithDebugger(1, 'a\n', { commaAsKey: false })
      .catch((e) => e)
      .finally(() => {
        settled = true;
      });
    await vi.advanceTimersByTimeAsync(COMMAND_TIMEOUT_MS + CLEANUP_TIMEOUT_MS + 10);
    expect(settled).toBe(true);
    const err = await done;
    expect(err).toBeInstanceOf(TrustedInputError);
    expect(mockDetach).toHaveBeenCalledTimes(1);
  });

  it('stops when the overall time budget is used up', async () => {
    const done = typeWithDebugger(1, '\n\n\n\n\n', { commaAsKey: false, budgetMs: 120 }).catch(
      (e) => e
    );
    await vi.runAllTimersAsync();
    const err = await done;
    expect(err).toBeInstanceOf(TrustedInputError);
    expect(err.message).toContain('Time budget');
    expect(err.sentChars).toBeLessThan(5);
    expect(mockDetach).toHaveBeenCalledTimes(1);
  });
});

describe('typeWithDebugger with the DialogHandler session', () => {
  let handler: DialogHandler;
  const acquire = (tabId: number) => handler.acquireDebugger(tabId);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    onEventListeners.length = 0;
    mockAttach.mockResolvedValue(undefined);
    mockDetach.mockResolvedValue(undefined);
    mockSendCommand.mockImplementation(async (_t: unknown, method: string) => {
      if (method === 'Page.handleJavaScriptDialog') throw new Error('No dialog is showing');
    });
    handler = new DialogHandler();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('attaches once and detaches afterwards when handle_dialog was not used', async () => {
    const done = typeWithDebugger(1, 'a\n', { commaAsKey: false, acquire });
    await vi.runAllTimersAsync();
    await done;
    expect(mockAttach).toHaveBeenCalledTimes(1);
    expect(mockDetach).toHaveBeenCalledTimes(1);
    expect(handler.isAttached(1)).toBe(false);
  });

  it('reuses the session handle_dialog attached and leaves it attached', async () => {
    const dialog = handler.handleDialog(1, { action: 'accept' });
    await vi.runAllTimersAsync();
    await dialog;
    expect(mockAttach).toHaveBeenCalledTimes(1);

    const done = typeWithDebugger(1, 'a\n', { commaAsKey: false, acquire });
    await vi.runAllTimersAsync();
    await done;
    expect(mockAttach).toHaveBeenCalledTimes(1);
    expect(mockDetach).not.toHaveBeenCalled();
    expect(handler.isAttached(1)).toBe(true);
  });

  it('lets handle_dialog run while typing is blocked by a dialog', async () => {
    mockSendCommand.mockImplementation((_t: unknown, method: string, params?: { type?: string }) => {
      if (method === 'Input.dispatchKeyEvent' && params?.type === 'keyDown') {
        // Enter opened an alert(): the key event does not return
        for (const l of onEventListeners) {
          l({ tabId: 1 }, 'Page.javascriptDialogOpening', {
            type: 'alert',
            message: 'Saved',
            url: 'https://example.com',
          });
        }
        return new Promise(() => {});
      }
      return Promise.resolve(undefined);
    });
    const typing = typeWithDebugger(1, 'a\n', { commaAsKey: false, acquire }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(10);

    // handle_dialog while the key event is pending: no second attach
    const dialog = await handler.handleDialog(1, { action: 'accept' });
    expect(dialog).toMatchObject({ handled: true, dialogType: 'alert', message: 'Saved' });
    expect(mockAttach).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(COMMAND_TIMEOUT_MS * 2);
    const err = await typing;
    expect(err).toBeInstanceOf(TrustedInputError);
    // handle_dialog now uses the session, so it stays attached
    expect(mockDetach).not.toHaveBeenCalled();
  });

  it('stays attached when a dialog opened during typing has not been handled', async () => {
    mockSendCommand.mockImplementation((_t: unknown, method: string, params?: { type?: string }) => {
      if (method === 'Input.dispatchKeyEvent' && params?.type === 'keyDown') {
        for (const l of onEventListeners) {
          l({ tabId: 1 }, 'Page.javascriptDialogOpening', {
            type: 'confirm',
            message: 'Leave?',
            url: 'https://example.com',
          });
        }
        return new Promise(() => {});
      }
      return Promise.resolve(undefined);
    });
    const typing = typeWithDebugger(1, '\n', { commaAsKey: false, acquire }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(COMMAND_TIMEOUT_MS * 3);
    await typing;
    expect(mockDetach).not.toHaveBeenCalled();
    expect(handler.isAttached(1)).toBe(true);
  });

  it('shares one attach between concurrent users', async () => {
    let finishAttach!: () => void;
    mockAttach.mockImplementation(() => new Promise<void>((r) => (finishAttach = r)));
    const a = handler.acquireDebugger(1);
    const b = handler.acquireDebugger(1);
    finishAttach();
    const [releaseA, releaseB] = await Promise.all([a, b]);
    expect(mockAttach).toHaveBeenCalledTimes(1);
    await releaseA();
    expect(mockDetach).not.toHaveBeenCalled();
    await releaseB();
    expect(mockDetach).toHaveBeenCalledTimes(1);
  });
});
