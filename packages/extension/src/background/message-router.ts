/**
 * Routes bridge requests from the MCP Server to appropriate handlers.
 */
import type {
  BridgeRequest,
  BridgeMessage,
  NavigateToParams,
  PageSnapshotParams,
  ClickParams,
  HoverParams,
  TypeTextParams,
  SelectOptionParams,
  ListWebMCPToolsParams,
  InvokeWebMCPToolParams,
  ScreenshotParams,
  NewTabParams,
  SwitchTabParams,
  CloseTabParams,
  GoBackParams,
  GoForwardParams,
  ReloadParams,
  WaitForNavigationParams,
  ScrollPageParams,
  DropFilesParams,
  HandleDialogParams,
} from 'webclaw-shared';
import { createResponse, createError } from 'webclaw-shared';
import type { TabManager } from './tab-manager';
import type { DialogHandler } from './dialog-handler';

/** Default timeout for waiting for tab load (30 seconds) */
const TAB_LOAD_TIMEOUT_MS = 30_000;

/** Default timeout for content script responses.
 *  Must be shorter than the MCP OPERATION_TIMEOUTS (10-15s) so the
 *  extension returns a non-retryable error before the ws-client fires. */
const CONTENT_SCRIPT_TIMEOUT_MS = 8_000;

export class MessageRouter {
  private dialogHandler?: DialogHandler;

  constructor(private tabManager: TabManager) {}

  /**
   * Send a message to the content script with a timeout.
   * When the timeout fires (e.g. dialog blocking JS), returns a descriptive
   * error instead of letting the MCP server's retry-able timeout trigger.
   */
  private sendToContentScript<T = unknown>(
    tabId: number,
    message: { action: string; [key: string]: unknown },
    timeoutMs = CONTENT_SCRIPT_TIMEOUT_MS
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            'Content script is not responding. ' +
              'A JavaScript dialog (alert/confirm/prompt) may be blocking the page. ' +
              'Use handle_dialog to dismiss it first.'
          )
        );
      }, timeoutMs);

      this.tabManager.sendToContentScript<T>(tabId, message).then(
        (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  /** Set the dialog handler (injected after construction to avoid circular deps) */
  setDialogHandler(handler: DialogHandler): void {
    this.dialogHandler = handler;
  }

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
        case 'hover':
          result = await this.handleHover(payload as HoverParams);
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
        case 'newTab':
          result = await this.handleNewTab(payload as NewTabParams);
          break;
        case 'listTabs':
          result = await this.handleListTabs();
          break;
        case 'switchTab':
          result = await this.handleSwitchTab(payload as SwitchTabParams);
          break;
        case 'closeTab':
          result = await this.handleCloseTab(payload as CloseTabParams);
          break;
        case 'goBack':
          result = await this.handleGoBack(payload as GoBackParams);
          break;
        case 'goForward':
          result = await this.handleGoForward(payload as GoForwardParams);
          break;
        case 'reload':
          result = await this.handleReload(payload as ReloadParams);
          break;
        case 'waitForNavigation':
          result = await this.handleWaitForNavigation(
            payload as WaitForNavigationParams
          );
          break;
        case 'scrollPage':
          result = await this.handleScrollPage(payload as ScrollPageParams);
          break;
        case 'dropFiles':
          result = await this.handleDropFiles(payload as DropFilesParams);
          break;
        case 'handleDialog':
          result = await this.handleDialogRequest(payload as HandleDialogParams);
          break;
        case 'ping':
          result = { pong: true, timestamp: Date.now() };
          break;
        default:
          return createError(id, method, 'UNKNOWN_METHOD', `Unknown method: ${method}`);
      }

      return createResponse(id, method, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // Classify errors for better diagnostics
      let code = 'HANDLER_ERROR';
      if (message.includes('not found') || message.includes('No tab with id')) {
        code = 'TAB_NOT_FOUND';
      } else if (message.includes('No active tab') || message.includes('No tab')) {
        code = 'NO_ACTIVE_TAB';
      } else if (message.includes('Stale snapshot')) {
        code = 'STALE_SNAPSHOT';
      } else if (message.includes('Cannot find a next page')) {
        code = 'NAVIGATION_TIMEOUT';
      }

      return createError(id, method, code, message);
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

    switch (message.action) {
      case 'log':
        chrome.runtime.sendMessage({
          channel: 'webclaw-sidepanel-update',
          type: 'activity',
          data: message.data,
          tabId,
        }).catch(() => {});
        sendResponse({ ok: true });
        break;

      case 'getTabId':
        sendResponse(tabId);
        break;

      default:
        sendResponse({ error: `Unknown content action: ${message.action}` });
    }
  }

  // --- Handler implementations ---

  /** Wait for a tab to finish loading */
  private waitForTabLoad(tabId: number, timeoutMs = TAB_LOAD_TIMEOUT_MS): Promise<void> {
    return new Promise<void>((resolve) => {
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

      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, timeoutMs);
    });
  }

  private async handleNavigate(params: NavigateToParams): Promise<unknown> {
    const tabId = await this.tabManager.getTargetTabId(params.tabId);
    await chrome.tabs.update(tabId, { url: params.url });
    await this.waitForTabLoad(tabId);
    const tab = await chrome.tabs.get(tabId);
    return { url: tab.url, title: tab.title, tabId };
  }

  private async handleSnapshot(params: PageSnapshotParams): Promise<unknown> {
    const tabId = await this.tabManager.getTargetTabId(params.tabId);
    const result = await this.sendToContentScript(tabId, {
      action: 'snapshot',
      maxTokens: params.maxTokens,
      focusRegion: params.focusRegion,
      interactiveOnly: params.interactiveOnly,
    });
    if (result && typeof result === 'object' && 'snapshotId' in (result as Record<string, unknown>)) {
      this.tabManager.setSnapshotId(tabId, (result as { snapshotId: string }).snapshotId);
    }
    return result;
  }

  private async handleClick(params: ClickParams): Promise<unknown> {
    const tabId = await this.tabManager.getTargetTabId(params.tabId);
    this.validateSnapshotId(tabId, params.snapshotId);
    return this.sendToContentScript(tabId, {
      action: 'click',
      ref: params.ref,
    });
  }

  private async handleHover(params: HoverParams): Promise<unknown> {
    const tabId = await this.tabManager.getTargetTabId(params.tabId);
    this.validateSnapshotId(tabId, params.snapshotId);
    return this.sendToContentScript(tabId, {
      action: 'hover',
      ref: params.ref,
    });
  }

  private async handleTypeText(params: TypeTextParams): Promise<unknown> {
    const tabId = await this.tabManager.getTargetTabId(params.tabId);
    this.validateSnapshotId(tabId, params.snapshotId);
    return this.sendToContentScript(tabId, {
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
    return this.sendToContentScript(tabId, {
      action: 'selectOption',
      ref: params.ref,
      value: params.value,
    });
  }

  private async handleListWebMCPTools(
    params: ListWebMCPToolsParams
  ): Promise<unknown> {
    const tabId = await this.tabManager.getTargetTabId(params.tabId);
    return this.sendToContentScript(tabId, {
      action: 'listWebMCPTools',
    });
  }

  private async handleInvokeWebMCPTool(
    params: InvokeWebMCPToolParams
  ): Promise<unknown> {
    const tabId = await this.tabManager.getTargetTabId(params.tabId);
    return this.sendToContentScript(
      tabId,
      { action: 'invokeWebMCPTool', toolName: params.toolName, args: params.args },
      25_000
    );
  }

  private async handleScreenshot(params: ScreenshotParams): Promise<unknown> {
    const tabId = await this.tabManager.getTargetTabId(params.tabId);
    const dataUrl = await chrome.tabs.captureVisibleTab(undefined, {
      format: 'png',
    });
    return { dataUrl, tabId };
  }

  private async handleNewTab(params: NewTabParams): Promise<unknown> {
    const createProps: chrome.tabs.CreateProperties = {};
    if (params.url) {
      createProps.url = params.url;
    }
    const tab = await chrome.tabs.create(createProps);
    if (params.url && tab.id) {
      await this.waitForTabLoad(tab.id);
    }
    const updatedTab = tab.id ? await chrome.tabs.get(tab.id) : tab;
    return {
      tabId: updatedTab.id,
      url: updatedTab.url,
      title: updatedTab.title,
    };
  }

  private async handleListTabs(): Promise<unknown> {
    const tabs = await chrome.tabs.query({});
    return {
      tabs: tabs.map((tab) => ({
        tabId: tab.id,
        url: tab.url,
        title: tab.title,
        active: tab.active,
      })),
    };
  }

  private async handleSwitchTab(params: SwitchTabParams): Promise<unknown> {
    await chrome.tabs.update(params.tabId, { active: true });
    const tab = await chrome.tabs.get(params.tabId);
    if (tab.windowId !== undefined) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    return {
      tabId: tab.id,
      url: tab.url,
      title: tab.title,
    };
  }

  private async handleCloseTab(params: CloseTabParams): Promise<unknown> {
    await chrome.tabs.remove(params.tabId);
    return { closed: true, tabId: params.tabId };
  }

  private async handleGoBack(params: GoBackParams): Promise<unknown> {
    const tabId = await this.tabManager.getTargetTabId(params.tabId);
    // Use history.back() via executeScript for broader compatibility
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({ length: history.length }),
    });
    if (result?.result?.length <= 1) {
      throw new Error('No previous page in navigation history');
    }
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => { history.back(); },
    });
    // Wait for the navigation to start and complete
    await new Promise((r) => setTimeout(r, 100));
    await this.waitForTabLoad(tabId, 10_000);
    const tab = await chrome.tabs.get(tabId);
    return { url: tab.url, title: tab.title, tabId };
  }

  private async handleGoForward(params: GoForwardParams): Promise<unknown> {
    const tabId = await this.tabManager.getTargetTabId(params.tabId);
    // Use history.forward() via executeScript for broader compatibility
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => { history.forward(); },
    });
    // Wait for the navigation to start and complete
    await new Promise((r) => setTimeout(r, 100));
    await this.waitForTabLoad(tabId, 10_000);
    const tab = await chrome.tabs.get(tabId);
    return { url: tab.url, title: tab.title, tabId };
  }

  private async handleReload(params: ReloadParams): Promise<unknown> {
    const tabId = await this.tabManager.getTargetTabId(params.tabId);
    await chrome.tabs.reload(tabId, {
      bypassCache: params.bypassCache ?? false,
    });
    await this.waitForTabLoad(tabId);
    const tab = await chrome.tabs.get(tabId);
    return { url: tab.url, title: tab.title, tabId };
  }

  private async handleWaitForNavigation(
    params: WaitForNavigationParams
  ): Promise<unknown> {
    const tabId = await this.tabManager.getTargetTabId(params.tabId);
    const timeoutMs = params.timeoutMs ?? TAB_LOAD_TIMEOUT_MS;

    // If tab is already loaded, return immediately
    try {
      const currentTab = await chrome.tabs.get(tabId);
      if (currentTab.status === 'complete') {
        return { url: currentTab.url, title: currentTab.title, tabId };
      }
    } catch {
      // Fall through to wait
    }

    await this.waitForTabLoad(tabId, timeoutMs);
    const tab = await chrome.tabs.get(tabId);
    return { url: tab.url, title: tab.title, tabId };
  }

  private async handleScrollPage(params: ScrollPageParams): Promise<unknown> {
    const tabId = await this.tabManager.getTargetTabId(params.tabId);

    if (params.ref) {
      // Scroll to a specific element
      if (params.snapshotId) {
        this.validateSnapshotId(tabId, params.snapshotId);
      }
      return this.sendToContentScript(tabId, {
        action: 'scrollToElement',
        ref: params.ref,
      });
    }

    // Scroll the page by direction/amount
    return this.sendToContentScript(tabId, {
      action: 'scrollPage',
      direction: params.direction ?? 'down',
      amount: params.amount,
    });
  }

  private async handleDropFiles(params: DropFilesParams): Promise<unknown> {
    const tabId = await this.tabManager.getTargetTabId(params.tabId);
    this.validateSnapshotId(tabId, params.snapshotId);
    return this.sendToContentScript(
      tabId,
      { action: 'dropFiles', ref: params.ref, files: params.files },
      25_000
    );
  }

  private async handleDialogRequest(
    params: HandleDialogParams
  ): Promise<unknown> {
    if (!this.dialogHandler) {
      throw new Error('DialogHandler not initialized');
    }
    const tabId = await this.tabManager.getTargetTabId(params.tabId);
    return this.dialogHandler.handleDialog(tabId, params);
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
