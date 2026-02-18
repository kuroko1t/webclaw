/**
 * Routes bridge requests from the MCP Server to appropriate handlers.
 */
import type {
  BridgeRequest,
  BridgeMessage,
  NavigateToParams,
  PageSnapshotParams,
  ClickParams,
  TypeTextParams,
  SelectOptionParams,
  ListWebMCPToolsParams,
  InvokeWebMCPToolParams,
  ScreenshotParams,
} from '@webclaw/shared';
import { createResponse, createError } from '@webclaw/shared';
import type { TabManager } from './tab-manager';

export class MessageRouter {
  constructor(private tabManager: TabManager) {}

  /** Handle a bridge request and return a response */
  async handleBridgeRequest(request: BridgeRequest): Promise<BridgeMessage> {
    const { id, method, payload } = request;

    try {
      let result: unknown;

      switch (method) {
        case 'navigate':
          result = await this.handleNavigate(payload as NavigateToParams);
          break;
        case 'snapshot':
          result = await this.handleSnapshot(payload as PageSnapshotParams);
          break;
        case 'click':
          result = await this.handleClick(payload as ClickParams);
          break;
        case 'typeText':
          result = await this.handleTypeText(payload as TypeTextParams);
          break;
        case 'selectOption':
          result = await this.handleSelectOption(payload as SelectOptionParams);
          break;
        case 'listWebMCPTools':
          result = await this.handleListWebMCPTools(
            payload as ListWebMCPToolsParams
          );
          break;
        case 'invokeWebMCPTool':
          result = await this.handleInvokeWebMCPTool(
            payload as InvokeWebMCPToolParams
          );
          break;
        case 'screenshot':
          result = await this.handleScreenshot(payload as ScreenshotParams);
          break;
        case 'ping':
          result = { pong: true, timestamp: Date.now() };
          break;
        default:
          return createError(id, method, 'UNKNOWN_METHOD', `Unknown method: ${method}`);
      }

      return createResponse(id, method, result);
    } catch (err) {
      return createError(
        id,
        method,
        'HANDLER_ERROR',
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  /** Handle content script messages */
  handleContentScriptMessage(
    message: { action: string; data?: unknown },
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
  ): void {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ error: 'No tab ID' });
      return;
    }

    // Forward activity logs to side panel
    if (message.action === 'log') {
      chrome.runtime.sendMessage({
        channel: 'webclaw-sidepanel-update',
        type: 'activity',
        data: message.data,
        tabId,
      }).catch(() => {});
      sendResponse({ ok: true });
    }
  }

  // --- Handler implementations ---

  private async handleNavigate(params: NavigateToParams): Promise<unknown> {
    const tabId = await this.tabManager.getTargetTabId(params.tabId);
    await chrome.tabs.update(tabId, { url: params.url });

    // Wait for page load
    await new Promise<void>((resolve) => {
      const listener = (
        updatedTabId: number,
        changeInfo: chrome.tabs.TabChangeInfo
      ) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);

      // Timeout after 30 seconds
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, 30_000);
    });

    const tab = await chrome.tabs.get(tabId);
    return { url: tab.url, title: tab.title, tabId };
  }

  private async handleSnapshot(params: PageSnapshotParams): Promise<unknown> {
    const tabId = await this.tabManager.getTargetTabId(params.tabId);
    const result = await this.tabManager.sendToContentScript(tabId, {
      action: 'snapshot',
      maxTokens: params.maxTokens,
    });
    if (result && typeof result === 'object' && 'snapshotId' in (result as Record<string, unknown>)) {
      this.tabManager.setSnapshotId(tabId, (result as { snapshotId: string }).snapshotId);
    }
    return result;
  }

  private async handleClick(params: ClickParams): Promise<unknown> {
    const tabId = await this.tabManager.getTargetTabId(params.tabId);
    this.validateSnapshotId(tabId, params.snapshotId);
    return this.tabManager.sendToContentScript(tabId, {
      action: 'click',
      ref: params.ref,
    });
  }

  private async handleTypeText(params: TypeTextParams): Promise<unknown> {
    const tabId = await this.tabManager.getTargetTabId(params.tabId);
    this.validateSnapshotId(tabId, params.snapshotId);
    return this.tabManager.sendToContentScript(tabId, {
      action: 'typeText',
      ref: params.ref,
      text: params.text,
      clearFirst: params.clearFirst,
    });
  }

  private async handleSelectOption(
    params: SelectOptionParams
  ): Promise<unknown> {
    const tabId = await this.tabManager.getTargetTabId(params.tabId);
    this.validateSnapshotId(tabId, params.snapshotId);
    return this.tabManager.sendToContentScript(tabId, {
      action: 'selectOption',
      ref: params.ref,
      value: params.value,
    });
  }

  private async handleListWebMCPTools(
    params: ListWebMCPToolsParams
  ): Promise<unknown> {
    const tabId = await this.tabManager.getTargetTabId(params.tabId);
    return this.tabManager.sendToContentScript(tabId, {
      action: 'listWebMCPTools',
    });
  }

  private async handleInvokeWebMCPTool(
    params: InvokeWebMCPToolParams
  ): Promise<unknown> {
    const tabId = await this.tabManager.getTargetTabId(params.tabId);
    return this.tabManager.sendToContentScript(tabId, {
      action: 'invokeWebMCPTool',
      toolName: params.toolName,
      args: params.args,
    });
  }

  private async handleScreenshot(params: ScreenshotParams): Promise<unknown> {
    const tabId = await this.tabManager.getTargetTabId(params.tabId);
    const dataUrl = await chrome.tabs.captureVisibleTab(undefined, {
      format: 'png',
    });
    return { dataUrl, tabId };
  }

  /** Validate that the snapshot ID matches the current tab snapshot */
  private validateSnapshotId(tabId: number, snapshotId: string): void {
    const currentSnapshotId = this.tabManager.getSnapshotId(tabId);
    if (currentSnapshotId && currentSnapshotId !== snapshotId) {
      throw new Error(
        `Stale snapshot: expected ${currentSnapshotId}, got ${snapshotId}. Take a new snapshot first.`
      );
    }
  }
}
