/**
 * Manages tab state and content script injection.
 */

interface TabState {
  id: number;
  url?: string;
  ready: boolean;
  snapshotId?: string;
}

export class TabManager {
  private tabs = new Map<number, TabState>();

  /** Get the active tab ID, or a specific tab */
  async getTargetTabId(requestedTabId?: number): Promise<number> {
    if (requestedTabId !== undefined) {
      return requestedTabId;
    }
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.id) {
      throw new Error('No active tab found');
    }
    return tab.id;
  }

  /** Send a message to a content script */
  async sendToContentScript<T = unknown>(
    tabId: number,
    message: { action: string; [key: string]: unknown }
  ): Promise<T> {
    await this.ensureContentScript(tabId);
    return chrome.tabs.sendMessage(tabId, {
      channel: 'webclaw-action',
      ...message,
    }) as Promise<T>;
  }

  /** Execute a script in the MAIN world of a tab */
  async executeInMainWorld<T>(
    tabId: number,
    func: (...args: unknown[]) => T,
    args: unknown[] = []
  ): Promise<T> {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func,
      args,
    });
    return results[0]?.result as T;
  }

  /** Ensure content script is injected into a tab */
  private async ensureContentScript(tabId: number): Promise<void> {
    const state = this.tabs.get(tabId);
    if (state?.ready) return;

    try {
      // Try sending a ping first
      await chrome.tabs.sendMessage(tabId, {
        channel: 'webclaw-action',
        action: 'ping',
      });
    } catch {
      // Content script not injected yet, inject it
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['src/content/content-script.js'],
      });
    }

    this.tabs.set(tabId, { id: tabId, ready: true });
  }

  /** Store the latest snapshot ID for a tab */
  setSnapshotId(tabId: number, snapshotId: string): void {
    const state = this.tabs.get(tabId) ?? { id: tabId, ready: true };
    state.snapshotId = snapshotId;
    this.tabs.set(tabId, state);
  }

  /** Get the latest snapshot ID for a tab */
  getSnapshotId(tabId: number): string | undefined {
    return this.tabs.get(tabId)?.snapshotId;
  }

  /** Mark tab as ready */
  onTabReady(tabId: number): void {
    const state = this.tabs.get(tabId);
    if (state) {
      state.ready = true;
    }
  }

  /** Clean up when tab is removed */
  onTabRemoved(tabId: number): void {
    this.tabs.delete(tabId);
  }
}
