import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock chrome APIs
const mockTabsUpdate = vi.fn();
const mockTabsGet = vi.fn();
const mockTabsCreate = vi.fn();
const mockTabsRemove = vi.fn();
const mockTabsQuery = vi.fn();
const mockTabsGoBack = vi.fn();
const mockTabsGoForward = vi.fn();
const mockTabsReload = vi.fn();
const mockTabsOnUpdated = {
  addListener: vi.fn(),
  removeListener: vi.fn(),
};
const mockCaptureVisibleTab = vi.fn();
const mockRuntimeSendMessage = vi.fn();
const mockWindowsUpdate = vi.fn();
const mockScriptingExecuteScript = vi.fn();

vi.stubGlobal('chrome', {
  tabs: {
    update: mockTabsUpdate,
    get: mockTabsGet,
    create: mockTabsCreate,
    remove: mockTabsRemove,
    query: mockTabsQuery,
    goBack: mockTabsGoBack,
    goForward: mockTabsGoForward,
    reload: mockTabsReload,
    onUpdated: mockTabsOnUpdated,
    sendMessage: vi.fn(),
    captureVisibleTab: mockCaptureVisibleTab,
  },
  windows: {
    update: mockWindowsUpdate,
  },
  scripting: {
    executeScript: mockScriptingExecuteScript,
  },
  runtime: {
    sendMessage: mockRuntimeSendMessage,
  },
});

import { MessageRouter } from '../background/message-router';
import type { TabManager } from '../background/tab-manager';
import type { DialogHandler } from '../background/dialog-handler';

function createMockTabManager(): TabManager {
  return {
    getTargetTabId: vi.fn().mockResolvedValue(1),
    sendToContentScript: vi.fn().mockResolvedValue({ success: true }),
    executeInMainWorld: vi.fn().mockResolvedValue({}),
    setSnapshotId: vi.fn(),
    getSnapshotId: vi.fn().mockReturnValue(undefined),
    onTabReady: vi.fn(),
    onTabRemoved: vi.fn(),
  } as unknown as TabManager;
}

function createMockDialogHandler(): DialogHandler {
  return {
    handleDialog: vi.fn().mockResolvedValue({ handled: false }),
    onTabRemoved: vi.fn(),
  } as unknown as DialogHandler;
}

describe('MessageRouter', () => {
  let router: MessageRouter;
  let mockTabManager: TabManager;
  let mockDialogHandler: DialogHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTabManager = createMockTabManager();
    mockDialogHandler = createMockDialogHandler();
    router = new MessageRouter(mockTabManager);
    router.setDialogHandler(mockDialogHandler);
  });

  describe('handleBridgeRequest', () => {
    it('routes ping and returns pong', async () => {
      const result = await router.handleBridgeRequest({
        id: 'req-1',
        type: 'request',
        method: 'ping',
        payload: {},
        timestamp: Date.now(),
      });
      expect(result.type).toBe('response');
      expect(result.method).toBe('ping');
      expect(result.payload).toHaveProperty('pong', true);
      expect(result.payload).toHaveProperty('timestamp');
    });

    it('returns error for unknown method', async () => {
      const result = await router.handleBridgeRequest({
        id: 'req-2',
        type: 'request',
        method: 'unknownMethod' as never,
        payload: {},
        timestamp: Date.now(),
      });
      expect(result.type).toBe('error');
      expect((result.payload as { message: string }).message).toContain(
        'Unknown method'
      );
    });

    it('routes snapshot to content script', async () => {
      (mockTabManager.sendToContentScript as ReturnType<typeof vi.fn>).mockResolvedValue({
        text: '[page]',
        snapshotId: 'snap-123',
        url: 'http://test.com',
        title: 'Test',
      });

      const result = await router.handleBridgeRequest({
        id: 'req-3',
        type: 'request',
        method: 'snapshot',
        payload: {},
        timestamp: Date.now(),
      });

      expect(result.type).toBe('response');
      expect(mockTabManager.sendToContentScript).toHaveBeenCalledWith(1, {
        action: 'snapshot',
      });
      expect(mockTabManager.setSnapshotId).toHaveBeenCalledWith(1, 'snap-123');
    });

    it('routes click to content script with ref', async () => {
      await router.handleBridgeRequest({
        id: 'req-4',
        type: 'request',
        method: 'click',
        payload: { ref: '@e1', snapshotId: 'snap-1' },
        timestamp: Date.now(),
      });

      expect(mockTabManager.sendToContentScript).toHaveBeenCalledWith(1, {
        action: 'click',
        ref: '@e1',
      });
    });

    it('routes typeText to content script', async () => {
      await router.handleBridgeRequest({
        id: 'req-5',
        type: 'request',
        method: 'typeText',
        payload: { ref: '@e2', text: 'hello', clearFirst: true, snapshotId: 'snap-1' },
        timestamp: Date.now(),
      });

      expect(mockTabManager.sendToContentScript).toHaveBeenCalledWith(1, {
        action: 'typeText',
        ref: '@e2',
        text: 'hello',
        clearFirst: true,
      });
    });

    it('routes selectOption to content script', async () => {
      await router.handleBridgeRequest({
        id: 'req-6',
        type: 'request',
        method: 'selectOption',
        payload: { ref: '@e3', value: 'blue', snapshotId: 'snap-1' },
        timestamp: Date.now(),
      });

      expect(mockTabManager.sendToContentScript).toHaveBeenCalledWith(1, {
        action: 'selectOption',
        ref: '@e3',
        value: 'blue',
      });
    });

    it('routes listWebMCPTools to content script', async () => {
      await router.handleBridgeRequest({
        id: 'req-7',
        type: 'request',
        method: 'listWebMCPTools',
        payload: {},
        timestamp: Date.now(),
      });

      expect(mockTabManager.sendToContentScript).toHaveBeenCalledWith(1, {
        action: 'listWebMCPTools',
      });
    });

    it('routes invokeWebMCPTool to content script', async () => {
      await router.handleBridgeRequest({
        id: 'req-8',
        type: 'request',
        method: 'invokeWebMCPTool',
        payload: { toolName: 'search', args: { q: 'test' } },
        timestamp: Date.now(),
      });

      expect(mockTabManager.sendToContentScript).toHaveBeenCalledWith(1, {
        action: 'invokeWebMCPTool',
        toolName: 'search',
        args: { q: 'test' },
      });
    });

    it('routes navigate and waits for page load', async () => {
      mockTabsUpdate.mockResolvedValue({});
      mockTabsGet.mockResolvedValue({
        url: 'http://example.com',
        title: 'Example',
        id: 1,
      });
      // Simulate tab completing load immediately
      mockTabsOnUpdated.addListener.mockImplementation((listener: Function) => {
        setTimeout(() => listener(1, { status: 'complete' }), 0);
      });

      const result = await router.handleBridgeRequest({
        id: 'req-9',
        type: 'request',
        method: 'navigate',
        payload: { url: 'http://example.com' },
        timestamp: Date.now(),
      });

      expect(result.type).toBe('response');
      expect(mockTabsUpdate).toHaveBeenCalledWith(1, { url: 'http://example.com' });
    });

    it('routes screenshot', async () => {
      mockCaptureVisibleTab.mockResolvedValue('data:image/png;base64,abc');
      vi.stubGlobal('chrome', {
        ...globalThis.chrome,
        tabs: {
          ...globalThis.chrome.tabs,
          captureVisibleTab: mockCaptureVisibleTab,
        },
      });

      // Re-create router to pick up new mock
      router = new MessageRouter(mockTabManager);

      const result = await router.handleBridgeRequest({
        id: 'req-10',
        type: 'request',
        method: 'screenshot',
        payload: {},
        timestamp: Date.now(),
      });

      expect(result.type).toBe('response');
    });

    it('routes newTab and creates a new tab', async () => {
      mockTabsCreate.mockResolvedValue({ id: 10, url: 'https://example.com', title: 'Example' });
      mockTabsGet.mockResolvedValue({ id: 10, url: 'https://example.com', title: 'Example' });
      mockTabsOnUpdated.addListener.mockImplementation((listener: Function) => {
        setTimeout(() => listener(10, { status: 'complete' }), 0);
      });

      const result = await router.handleBridgeRequest({
        id: 'req-newtab',
        type: 'request',
        method: 'newTab',
        payload: { url: 'https://example.com' },
        timestamp: Date.now(),
      });

      expect(result.type).toBe('response');
      expect(mockTabsCreate).toHaveBeenCalledWith({ url: 'https://example.com' });
    });

    it('routes listTabs and returns tab list', async () => {
      mockTabsQuery.mockResolvedValue([
        { id: 1, url: 'https://a.com', title: 'A', active: true },
        { id: 2, url: 'https://b.com', title: 'B', active: false },
      ]);

      const result = await router.handleBridgeRequest({
        id: 'req-listtabs',
        type: 'request',
        method: 'listTabs',
        payload: {},
        timestamp: Date.now(),
      });

      expect(result.type).toBe('response');
      expect(mockTabsQuery).toHaveBeenCalledWith({});
      const payload = result.payload as { tabs: Array<{ tabId: number }> };
      expect(payload.tabs).toHaveLength(2);
    });

    it('routes switchTab and activates tab', async () => {
      mockTabsUpdate.mockResolvedValue({});
      mockTabsGet.mockResolvedValue({ id: 5, url: 'https://c.com', title: 'C', windowId: 1 });
      mockWindowsUpdate.mockResolvedValue({});

      const result = await router.handleBridgeRequest({
        id: 'req-switch',
        type: 'request',
        method: 'switchTab',
        payload: { tabId: 5 },
        timestamp: Date.now(),
      });

      expect(result.type).toBe('response');
      expect(mockTabsUpdate).toHaveBeenCalledWith(5, { active: true });
    });

    it('routes closeTab and removes tab', async () => {
      mockTabsRemove.mockResolvedValue(undefined);

      const result = await router.handleBridgeRequest({
        id: 'req-close',
        type: 'request',
        method: 'closeTab',
        payload: { tabId: 3 },
        timestamp: Date.now(),
      });

      expect(result.type).toBe('response');
      expect(mockTabsRemove).toHaveBeenCalledWith(3);
    });

    it('routes goBack via executeScript history.back()', async () => {
      // First call: history.length check; second call: history.back()
      mockScriptingExecuteScript
        .mockResolvedValueOnce([{ result: { length: 3 } }])
        .mockResolvedValueOnce([{ result: undefined }]);
      mockTabsGet.mockResolvedValue({ id: 1, url: 'https://prev.com', title: 'Prev' });
      mockTabsOnUpdated.addListener.mockImplementation((listener: Function) => {
        setTimeout(() => listener(1, { status: 'complete' }), 0);
      });

      const result = await router.handleBridgeRequest({
        id: 'req-back',
        type: 'request',
        method: 'goBack',
        payload: {},
        timestamp: Date.now(),
      });

      expect(result.type).toBe('response');
      expect(mockScriptingExecuteScript).toHaveBeenCalledTimes(2);
      expect(mockScriptingExecuteScript).toHaveBeenCalledWith(
        expect.objectContaining({ target: { tabId: 1 } })
      );
    });

    it('routes goForward via executeScript history.forward()', async () => {
      mockScriptingExecuteScript.mockResolvedValue([{ result: undefined }]);
      mockTabsGet.mockResolvedValue({ id: 1, url: 'https://next.com', title: 'Next' });
      mockTabsOnUpdated.addListener.mockImplementation((listener: Function) => {
        setTimeout(() => listener(1, { status: 'complete' }), 0);
      });

      const result = await router.handleBridgeRequest({
        id: 'req-forward',
        type: 'request',
        method: 'goForward',
        payload: {},
        timestamp: Date.now(),
      });

      expect(result.type).toBe('response');
      expect(mockScriptingExecuteScript).toHaveBeenCalledWith(
        expect.objectContaining({ target: { tabId: 1 } })
      );
    });

    it('routes reload and waits for load', async () => {
      mockTabsReload.mockResolvedValue(undefined);
      mockTabsGet.mockResolvedValue({ id: 1, url: 'https://reloaded.com', title: 'Reloaded' });
      mockTabsOnUpdated.addListener.mockImplementation((listener: Function) => {
        setTimeout(() => listener(1, { status: 'complete' }), 0);
      });

      const result = await router.handleBridgeRequest({
        id: 'req-reload',
        type: 'request',
        method: 'reload',
        payload: { bypassCache: true },
        timestamp: Date.now(),
      });

      expect(result.type).toBe('response');
      expect(mockTabsReload).toHaveBeenCalledWith(1, { bypassCache: true });
    });

    it('routes waitForNavigation (returns immediately if already loaded)', async () => {
      mockTabsGet.mockResolvedValue({ id: 1, url: 'https://loaded.com', title: 'Loaded', status: 'complete' });

      const result = await router.handleBridgeRequest({
        id: 'req-wait',
        type: 'request',
        method: 'waitForNavigation',
        payload: { timeoutMs: 5000 },
        timestamp: Date.now(),
      });

      expect(result.type).toBe('response');
      expect((result.payload as { url: string }).url).toBe('https://loaded.com');
    });

    it('routes scrollPage to content script', async () => {
      await router.handleBridgeRequest({
        id: 'req-scroll',
        type: 'request',
        method: 'scrollPage',
        payload: { direction: 'down', amount: 500 },
        timestamp: Date.now(),
      });

      expect(mockTabManager.sendToContentScript).toHaveBeenCalledWith(1, {
        action: 'scrollPage',
        direction: 'down',
        amount: 500,
      });
    });

    it('routes scrollPage with ref to scrollToElement', async () => {
      await router.handleBridgeRequest({
        id: 'req-scroll-ref',
        type: 'request',
        method: 'scrollPage',
        payload: { ref: '@e5', snapshotId: 'snap-1' },
        timestamp: Date.now(),
      });

      expect(mockTabManager.sendToContentScript).toHaveBeenCalledWith(1, {
        action: 'scrollToElement',
        ref: '@e5',
      });
    });

    it('routes handleDialog to dialog handler', async () => {
      (mockDialogHandler.handleDialog as ReturnType<typeof vi.fn>).mockResolvedValue({
        dialogType: 'alert',
        message: 'Hello!',
        handled: true,
      });

      const result = await router.handleBridgeRequest({
        id: 'req-dialog',
        type: 'request',
        method: 'handleDialog',
        payload: { action: 'accept' },
        timestamp: Date.now(),
      });

      expect(result.type).toBe('response');
      expect(mockDialogHandler.handleDialog).toHaveBeenCalledWith(1, { action: 'accept' });
      expect((result.payload as { handled: boolean }).handled).toBe(true);
    });

    it('routes handleDialog with promptText', async () => {
      (mockDialogHandler.handleDialog as ReturnType<typeof vi.fn>).mockResolvedValue({
        dialogType: 'prompt',
        message: 'Enter name:',
        handled: true,
      });

      await router.handleBridgeRequest({
        id: 'req-dialog-prompt',
        type: 'request',
        method: 'handleDialog',
        payload: { action: 'accept', promptText: 'John' },
        timestamp: Date.now(),
      });

      expect(mockDialogHandler.handleDialog).toHaveBeenCalledWith(1, {
        action: 'accept',
        promptText: 'John',
      });
    });

    it('classifies TAB_NOT_FOUND errors', async () => {
      mockTabsRemove.mockRejectedValue(
        new Error('No tab with id: 999')
      );

      const result = await router.handleBridgeRequest({
        id: 'req-notfound',
        type: 'request',
        method: 'closeTab',
        payload: { tabId: 999 },
        timestamp: Date.now(),
      });

      expect(result.type).toBe('error');
      expect((result.payload as { code: string }).code).toBe('TAB_NOT_FOUND');
    });

    it('catches handler errors and returns error response', async () => {
      (mockTabManager.getTargetTabId as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Tab not found')
      );

      const result = await router.handleBridgeRequest({
        id: 'req-err',
        type: 'request',
        method: 'snapshot',
        payload: {},
        timestamp: Date.now(),
      });

      expect(result.type).toBe('error');
      expect((result.payload as { message: string }).message).toContain('Tab not found');
    });

    it('uses provided tabId for routing', async () => {
      await router.handleBridgeRequest({
        id: 'req-tab',
        type: 'request',
        method: 'snapshot',
        payload: { tabId: 42 },
        timestamp: Date.now(),
      });

      expect(mockTabManager.getTargetTabId).toHaveBeenCalledWith(42);
    });
  });

  describe('validateSnapshotId', () => {
    it('throws on stale snapshot ID', async () => {
      (mockTabManager.getSnapshotId as ReturnType<typeof vi.fn>).mockReturnValue('snap-current');

      const result = await router.handleBridgeRequest({
        id: 'req-stale',
        type: 'request',
        method: 'click',
        payload: { ref: '@e1', snapshotId: 'snap-old' },
        timestamp: Date.now(),
      });

      expect(result.type).toBe('error');
      expect((result.payload as { message: string }).message).toContain('Stale snapshot');
    });

    it('passes when snapshot IDs match', async () => {
      (mockTabManager.getSnapshotId as ReturnType<typeof vi.fn>).mockReturnValue('snap-current');

      const result = await router.handleBridgeRequest({
        id: 'req-match',
        type: 'request',
        method: 'click',
        payload: { ref: '@e1', snapshotId: 'snap-current' },
        timestamp: Date.now(),
      });

      expect(result.type).toBe('response');
    });

    it('passes when no stored snapshot ID (first action)', async () => {
      (mockTabManager.getSnapshotId as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      const result = await router.handleBridgeRequest({
        id: 'req-first',
        type: 'request',
        method: 'click',
        payload: { ref: '@e1', snapshotId: 'snap-any' },
        timestamp: Date.now(),
      });

      expect(result.type).toBe('response');
    });
  });

  describe('handleContentScriptMessage', () => {
    it('handles log action', () => {
      const sendResponse = vi.fn();
      mockRuntimeSendMessage.mockResolvedValue({});

      router.handleContentScriptMessage(
        { action: 'log', data: { action: 'click', ref: '@e1' } },
        { tab: { id: 5 } } as chrome.runtime.MessageSender,
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith({ ok: true });
      expect(mockRuntimeSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'webclaw-sidepanel-update',
          type: 'activity',
          tabId: 5,
        })
      );
    });

    it('handles getTabId action', () => {
      const sendResponse = vi.fn();

      router.handleContentScriptMessage(
        { action: 'getTabId' },
        { tab: { id: 42 } } as chrome.runtime.MessageSender,
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith(42);
    });

    it('returns error for unknown action', () => {
      const sendResponse = vi.fn();

      router.handleContentScriptMessage(
        { action: 'invalid' },
        { tab: { id: 1 } } as chrome.runtime.MessageSender,
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('Unknown') })
      );
    });

    it('returns error when no tab ID', () => {
      const sendResponse = vi.fn();

      router.handleContentScriptMessage(
        { action: 'log' },
        {} as chrome.runtime.MessageSender,
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith({ error: 'No tab ID' });
    });
  });
});
