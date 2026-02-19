import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock chrome APIs before importing TabManager
const mockQuery = vi.fn();
const mockSendMessage = vi.fn();
const mockExecuteScript = vi.fn();

vi.stubGlobal('chrome', {
  tabs: {
    query: mockQuery,
    sendMessage: mockSendMessage,
  },
  scripting: {
    executeScript: mockExecuteScript,
  },
});

import { TabManager } from '../background/tab-manager';

describe('TabManager', () => {
  let tabManager: TabManager;

  beforeEach(() => {
    tabManager = new TabManager();
    vi.clearAllMocks();
  });

  describe('getTargetTabId', () => {
    it('returns the requested tab ID when provided', async () => {
      const tabId = await tabManager.getTargetTabId(42);
      expect(tabId).toBe(42);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('queries active tab when no tab ID provided', async () => {
      mockQuery.mockResolvedValue([{ id: 10 }]);
      const tabId = await tabManager.getTargetTabId();
      expect(tabId).toBe(10);
      expect(mockQuery).toHaveBeenCalledWith({
        active: true,
        currentWindow: true,
      });
    });

    it('throws when no active tab found', async () => {
      mockQuery.mockResolvedValue([]);
      await expect(tabManager.getTargetTabId()).rejects.toThrow(
        'No active tab found'
      );
    });

    it('throws when active tab has no id', async () => {
      mockQuery.mockResolvedValue([{ url: 'about:blank' }]);
      await expect(tabManager.getTargetTabId()).rejects.toThrow(
        'No active tab found'
      );
    });

    it('returns explicitly provided tabId=0', async () => {
      const tabId = await tabManager.getTargetTabId(0);
      expect(tabId).toBe(0);
    });
  });

  describe('sendToContentScript', () => {
    it('sends message to content script with channel prefix', async () => {
      // First call: ping succeeds (content script already injected)
      mockSendMessage.mockResolvedValue({ pong: true });
      await tabManager.sendToContentScript(5, { action: 'snapshot' });
      // First call is ping, second is the actual message
      expect(mockSendMessage).toHaveBeenCalledWith(5, {
        channel: 'webclaw-action',
        action: 'ping',
      });
    });

    it('injects content script on ping failure', async () => {
      // First call (ping): fails
      mockSendMessage.mockRejectedValueOnce(new Error('No listener'));
      // After injection, second call returns result
      mockExecuteScript.mockResolvedValue([]);
      mockSendMessage.mockResolvedValueOnce({ result: 'ok' });

      await tabManager.sendToContentScript(7, { action: 'snapshot' });
      expect(mockExecuteScript).toHaveBeenCalledWith({
        target: { tabId: 7 },
        files: ['src/content/content-script.js'],
      });
    });

    it('skips ping for already-ready tabs', async () => {
      // Mark tab as ready via ping
      mockSendMessage.mockResolvedValue({ pong: true });
      await tabManager.sendToContentScript(5, { action: 'snapshot' });

      vi.clearAllMocks();
      mockSendMessage.mockResolvedValue({ text: 'snap' });

      // Second call should skip the ping
      await tabManager.sendToContentScript(5, { action: 'snapshot' });
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      expect(mockSendMessage).toHaveBeenCalledWith(5, {
        channel: 'webclaw-action',
        action: 'snapshot',
      });
    });
  });

  describe('snapshot ID management', () => {
    it('setSnapshotId and getSnapshotId', () => {
      tabManager.setSnapshotId(1, 'snap-abc');
      expect(tabManager.getSnapshotId(1)).toBe('snap-abc');
    });

    it('returns undefined for unknown tab', () => {
      expect(tabManager.getSnapshotId(999)).toBeUndefined();
    });

    it('overwrites previous snapshot ID', () => {
      tabManager.setSnapshotId(1, 'snap-1');
      tabManager.setSnapshotId(1, 'snap-2');
      expect(tabManager.getSnapshotId(1)).toBe('snap-2');
    });

    it('setSnapshotId creates state for unknown tab', () => {
      tabManager.setSnapshotId(100, 'snap-new');
      expect(tabManager.getSnapshotId(100)).toBe('snap-new');
    });
  });

  describe('onTabReady', () => {
    it('marks existing tab as ready', () => {
      // Pre-register the tab by setting snapshot
      tabManager.setSnapshotId(1, 'snap-1');
      tabManager.onTabReady(1);
      // No error thrown — just marks as ready
    });

    it('does nothing for unknown tab', () => {
      // Should not throw
      tabManager.onTabReady(999);
    });
  });

  describe('onTabRemoved', () => {
    it('removes tab state', () => {
      tabManager.setSnapshotId(1, 'snap-1');
      expect(tabManager.getSnapshotId(1)).toBe('snap-1');
      tabManager.onTabRemoved(1);
      expect(tabManager.getSnapshotId(1)).toBeUndefined();
    });

    it('does nothing for unknown tab', () => {
      // Should not throw
      tabManager.onTabRemoved(999);
    });
  });
});
