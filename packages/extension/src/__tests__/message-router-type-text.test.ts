import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.stubGlobal('chrome', {
  tabs: { onUpdated: { addListener: vi.fn(), removeListener: vi.fn() } },
  runtime: { sendMessage: vi.fn() },
});

const typeWithDebugger = vi.fn();
vi.mock('../background/trusted-input', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../background/trusted-input')>();
  return { ...actual, typeWithDebugger: (...args: unknown[]) => typeWithDebugger(...args) };
});

import { MessageRouter } from '../background/message-router';
import { TrustedInputError } from '../background/trusted-input';
import type { TabManager } from '../background/tab-manager';
import type { DialogHandler } from '../background/dialog-handler';

function request(payload: Record<string, unknown>) {
  return {
    id: 'req-1',
    type: 'request' as const,
    method: 'typeText' as const,
    payload: { ref: '@e1', snapshotId: 'snap-1', ...payload },
    timestamp: Date.now(),
  };
}

describe('MessageRouter handleTypeText', () => {
  let router: MessageRouter;
  let sendToContentScript: ReturnType<typeof vi.fn>;
  let acquireDebugger: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    sendToContentScript = vi.fn().mockImplementation(async (_tabId: number, msg: { mode?: string; pressKeys?: boolean }) => {
      if (msg.pressKeys && !msg.mode) return { success: true, needsTrustedInput: true, commaAsKey: false };
      return { success: true };
    });
    const tabManager = {
      getTargetTabId: vi.fn().mockResolvedValue(1),
      sendToContentScript,
      getSnapshotId: vi.fn().mockReturnValue(undefined),
    } as unknown as TabManager;
    acquireDebugger = vi.fn().mockResolvedValue(async () => {});
    router = new MessageRouter(tabManager);
    router.setDialogHandler({ acquireDebugger } as unknown as DialogHandler);
    typeWithDebugger.mockResolvedValue(undefined);
  });

  it('keeps the value path when pressKeys is not set, even with newlines', async () => {
    const res = await router.handleBridgeRequest(request({ text: 'line1\nline2' }));
    expect(res.type).toBe('response');
    expect(sendToContentScript).toHaveBeenCalledTimes(1);
    expect(sendToContentScript.mock.calls[0][1]).not.toHaveProperty('pressKeys');
    expect(typeWithDebugger).not.toHaveBeenCalled();
  });

  it('ignores needsTrustedInput from the content script without pressKeys', async () => {
    sendToContentScript.mockResolvedValue({ success: true, needsTrustedInput: true });
    await router.handleBridgeRequest(request({ text: 'a\n', pressKeys: false }));
    expect(typeWithDebugger).not.toHaveBeenCalled();
  });

  it('types with trusted input when pressKeys is true', async () => {
    const res = await router.handleBridgeRequest(request({ text: 'a\n', pressKeys: true }));
    expect(sendToContentScript.mock.calls[0][1]).toMatchObject({ action: 'typeText', pressKeys: true });
    expect(typeWithDebugger).toHaveBeenCalledTimes(1);
    const [tabId, text, opts] = typeWithDebugger.mock.calls[0];
    expect(tabId).toBe(1);
    expect(text).toBe('a\n');
    expect(opts.commaAsKey).toBe(false);
    // The session is borrowed from the dialog handler
    await opts.acquire(1);
    expect(acquireDebugger).toHaveBeenCalledWith(1);
    expect(res.payload).toEqual({ success: true, trusted: true });
    expect(sendToContentScript).toHaveBeenCalledTimes(1);
  });

  it('falls back to synthetic events only when the debugger cannot attach', async () => {
    typeWithDebugger.mockRejectedValue(new TrustedInputError('Could not attach the debugger: busy', 'attach'));
    const res = await router.handleBridgeRequest(request({ text: 'a\n', pressKeys: true }));
    expect(sendToContentScript).toHaveBeenCalledTimes(2);
    expect(sendToContentScript.mock.calls[1][1]).toMatchObject({ mode: 'synthetic', pressKeys: true });
    expect(res.type).toBe('response');
    expect(res.payload).toMatchObject({ success: true, trusted: false });
  });

  it('does not type again when trusted input fails part way', async () => {
    typeWithDebugger.mockRejectedValue(
      new TrustedInputError('Typing stopped after 1 of 2 characters (1 of 2 steps) were sent: boom', 'input', 1, 2)
    );
    const res = await router.handleBridgeRequest(request({ text: 'a\n', pressKeys: true }));
    expect(sendToContentScript).toHaveBeenCalledTimes(1);
    expect(res.type).toBe('error');
    expect((res.payload as { message: string }).message).toContain('1 of 2 characters');
  });
});
