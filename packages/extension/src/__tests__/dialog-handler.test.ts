import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock chrome.debugger API
const mockDebuggerAttach = vi.fn();
const mockDebuggerDetach = vi.fn();
const mockDebuggerSendCommand = vi.fn();
const debuggerOnEventListeners: Array<
  (source: chrome.debugger.Debuggee, method: string, params?: object) => void
> = [];
const debuggerOnDetachListeners: Array<
  (source: chrome.debugger.Debuggee, reason: string) => void
> = [];

vi.stubGlobal('chrome', {
  debugger: {
    attach: mockDebuggerAttach,
    detach: mockDebuggerDetach,
    sendCommand: mockDebuggerSendCommand,
    onEvent: {
      addListener: vi.fn((cb: typeof debuggerOnEventListeners[0]) => {
        debuggerOnEventListeners.push(cb);
      }),
    },
    onDetach: {
      addListener: vi.fn((cb: typeof debuggerOnDetachListeners[0]) => {
        debuggerOnDetachListeners.push(cb);
      }),
    },
  },
});

import { DialogHandler } from '../background/dialog-handler';

/** Simulate a CDP dialog event */
function simulateDialogEvent(tabId: number, type: string, message: string, defaultPrompt = '') {
  for (const listener of debuggerOnEventListeners) {
    listener(
      { tabId },
      'Page.javascriptDialogOpening',
      { type, message, defaultPrompt, url: 'https://example.com' }
    );
  }
  // Dialog is now open — CDP handling should succeed
  mockDebuggerSendCommand.mockResolvedValue(undefined);
}

/** Simulate debugger being externally detached */
function simulateDetach(tabId: number, reason = 'target_closed') {
  for (const listener of debuggerOnDetachListeners) {
    listener({ tabId }, reason);
  }
}

describe('DialogHandler', () => {
  let handler: DialogHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    debuggerOnEventListeners.length = 0;
    debuggerOnDetachListeners.length = 0;
    mockDebuggerAttach.mockResolvedValue(undefined);
    mockDebuggerDetach.mockResolvedValue(undefined);
    // Default: no dialog is showing (matches real Chrome behavior)
    mockDebuggerSendCommand.mockImplementation(async (_target: unknown, method: string) => {
      if (method === 'Page.handleJavaScriptDialog') {
        throw new Error('No dialog is showing');
      }
    });
    handler = new DialogHandler();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns handled: false when no dialog is present', async () => {
    // Page.handleJavaScriptDialog fails (no dialog open)
    mockDebuggerSendCommand.mockImplementation(async (_target: unknown, method: string) => {
      if (method === 'Page.handleJavaScriptDialog') {
        throw new Error('No dialog is showing');
      }
    });

    const promise = handler.handleDialog(1, { action: 'accept' });
    await vi.advanceTimersByTimeAsync(4000);

    const result = await promise;
    expect(result.handled).toBe(false);
    expect(mockDebuggerAttach).toHaveBeenCalledWith({ tabId: 1 }, '1.3');
  });

  it('accepts an alert dialog detected via event', async () => {
    // Simulate dialog appearing shortly after attach
    mockDebuggerAttach.mockImplementation(async () => {
      setTimeout(() => simulateDialogEvent(1, 'alert', 'Hello!'), 50);
    });

    const promise = handler.handleDialog(1, { action: 'accept' });
    await vi.advanceTimersByTimeAsync(200);

    const result = await promise;
    expect(result).toEqual({
      dialogType: 'alert',
      message: 'Hello!',
      defaultPrompt: undefined,
      handled: true,
    });
    expect(mockDebuggerSendCommand).toHaveBeenCalledWith(
      { tabId: 1 },
      'Page.handleJavaScriptDialog',
      { accept: true }
    );
  });

  it('dismisses a confirm dialog', async () => {
    mockDebuggerAttach.mockImplementation(async () => {
      setTimeout(() => simulateDialogEvent(1, 'confirm', 'Are you sure?'), 50);
    });

    const promise = handler.handleDialog(1, { action: 'dismiss' });
    await vi.advanceTimersByTimeAsync(200);

    const result = await promise;
    expect(result).toEqual({
      dialogType: 'confirm',
      message: 'Are you sure?',
      defaultPrompt: undefined,
      handled: true,
    });
    expect(mockDebuggerSendCommand).toHaveBeenCalledWith(
      { tabId: 1 },
      'Page.handleJavaScriptDialog',
      { accept: false }
    );
  });

  it('accepts a prompt dialog with custom text', async () => {
    mockDebuggerAttach.mockImplementation(async () => {
      setTimeout(() => simulateDialogEvent(1, 'prompt', 'Enter name:', 'default'), 50);
    });

    const promise = handler.handleDialog(1, {
      action: 'accept',
      promptText: 'John',
    });
    await vi.advanceTimersByTimeAsync(200);

    const result = await promise;
    expect(result).toEqual({
      dialogType: 'prompt',
      message: 'Enter name:',
      defaultPrompt: 'default',
      handled: true,
    });
    expect(mockDebuggerSendCommand).toHaveBeenCalledWith(
      { tabId: 1 },
      'Page.handleJavaScriptDialog',
      { accept: true, promptText: 'John' }
    );
  });

  it('handles dialog already open via direct CDP command', async () => {
    // Dialog already showing — CDP command succeeds directly
    mockDebuggerSendCommand.mockResolvedValue(undefined);
    const promise = handler.handleDialog(1, { action: 'accept' });
    await vi.advanceTimersByTimeAsync(4000);
    const result = await promise;

    expect(result.handled).toBe(true);
    expect(result.dialogType).toBeUndefined();
  });

  it('handles pre-existing pending dialog immediately', async () => {
    simulateDialogEvent(1, 'alert', 'Pre-existing');

    const result = await handler.handleDialog(1, { action: 'accept' });
    expect(result.handled).toBe(true);
    expect(result.message).toBe('Pre-existing');
  });

  it('throws when another debugger is attached', async () => {
    mockDebuggerAttach.mockRejectedValue(
      new Error('Another debugger is already attached to this tab')
    );

    await expect(
      handler.handleDialog(1, { action: 'accept' })
    ).rejects.toThrow('Cannot attach debugger: Chrome DevTools');
  });

  it('keeps debugger attached after handling (no auto-detach)', async () => {
    mockDebuggerAttach.mockImplementation(async () => {
      setTimeout(() => simulateDialogEvent(1, 'alert', 'Test'), 50);
    });

    const promise = handler.handleDialog(1, { action: 'accept' });
    await vi.advanceTimersByTimeAsync(200);
    await promise;

    // Debugger stays attached — no detach scheduled
    await vi.advanceTimersByTimeAsync(5000);
    expect(mockDebuggerDetach).not.toHaveBeenCalled();
  });

  it('cleans up on tab removal', async () => {
    simulateDialogEvent(1, 'alert', 'Pending');
    handler.onTabRemoved(1);

    // Fallback sendCommand should fail (no dialog)
    mockDebuggerSendCommand.mockImplementation(async (_target: unknown, method: string) => {
      if (method === 'Page.handleJavaScriptDialog') {
        throw new Error('No dialog is showing');
      }
    });

    const promise = handler.handleDialog(1, { action: 'accept' });
    await vi.advanceTimersByTimeAsync(4000);
    const result = await promise;
    expect(result.handled).toBe(false);
  });

  it('cleans up when debugger is externally detached', async () => {
    mockDebuggerAttach.mockImplementation(async () => {
      setTimeout(() => simulateDialogEvent(1, 'alert', 'Test'), 50);
    });

    const promise = handler.handleDialog(1, { action: 'accept' });
    await vi.advanceTimersByTimeAsync(200);
    await promise;

    // Simulate external detach
    simulateDetach(1, 'replaced_with_devtools');

    // Next call should re-attach
    mockDebuggerAttach.mockResolvedValue(undefined);
    mockDebuggerSendCommand.mockImplementation(async (_target: unknown, method: string) => {
      if (method === 'Page.handleJavaScriptDialog') {
        throw new Error('No dialog is showing');
      }
    });
    const promise2 = handler.handleDialog(1, { action: 'accept' });
    await vi.advanceTimersByTimeAsync(4000);
    await promise2;

    // Should have attempted attach again
    expect(mockDebuggerAttach).toHaveBeenCalledTimes(2);
  });

  it('enables Page domain after attach', async () => {
    mockDebuggerSendCommand.mockImplementation(async (_target: unknown, method: string) => {
      if (method === 'Page.handleJavaScriptDialog') {
        throw new Error('No dialog is showing');
      }
    });

    const promise = handler.handleDialog(1, { action: 'accept' });
    await vi.advanceTimersByTimeAsync(4000);
    await promise;

    expect(mockDebuggerSendCommand).toHaveBeenCalledWith(
      { tabId: 1 },
      'Page.enable'
    );
  });
});
