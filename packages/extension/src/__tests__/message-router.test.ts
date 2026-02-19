import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock chrome APIs
const mockTabsUpdate = vi.fn();
const mockTabsGet = vi.fn();
const mockTabsOnUpdated = {
  addListener: vi.fn(),
  removeListener: vi.fn(),
};
const mockCaptureVisibleTab = vi.fn();
const mockRuntimeSendMessage = vi.fn();

vi.stubGlobal('chrome', {
  tabs: {
    update: mockTabsUpdate,
    get: mockTabsGet,
    onUpdated: mockTabsOnUpdated,
    query: vi.fn(),
    sendMessage: vi.fn(),
  },
  scripting: {
    executeScript: vi.fn(),
  },
  runtime: {
    sendMessage: mockRuntimeSendMessage,
  },
});

import { MessageRouter } from '../background/message-router';
import type { TabManager } from '../background/tab-manager';

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

describe('MessageRouter', () => {
  let router: MessageRouter;
  let mockTabManager: TabManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTabManager = createMockTabManager();
    router = new MessageRouter(mockTabManager);
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
        payload: { maxTokens: 4000 },
        timestamp: Date.now(),
      });

      expect(result.type).toBe('response');
      expect(mockTabManager.sendToContentScript).toHaveBeenCalledWith(1, {
        action: 'snapshot',
        maxTokens: 4000,
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
        payload: { tabId: 42, maxTokens: 1000 },
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
