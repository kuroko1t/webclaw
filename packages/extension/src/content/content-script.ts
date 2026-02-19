/**
 * WebClaw Content Script.
 *
 * Injected into every page. Handles:
 * - Snapshot generation (@ref A11y tree)
 * - Action execution (click, type, select)
 * - WebMCP discovery and invocation
 * - Communication with Service Worker
 */
import { takeSnapshot, resolveRef, getCurrentSnapshotId } from './snapshot-engine';
import { clickElement, typeText, selectOption, invokeWebMCPTool } from './action-executor';
import { discoverWebMCPTools, getCachedTools } from './webmcp-discovery';

// Inject page bridge script into MAIN world for WebMCP access
injectPageBridge();

// Listen for messages from Service Worker
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.channel !== 'webclaw-action') return false;
  handleAction(message).then(sendResponse).catch((err) => {
    sendResponse({ error: err instanceof Error ? err.message : String(err) });
  });
  return true; // Keep channel open for async response
});

async function handleAction(message: {
  action: string;
  [key: string]: unknown;
}): Promise<unknown> {
  const { action } = message;

  switch (action) {
    case 'ping':
      return { pong: true };

    case 'snapshot': {
      const maxTokens = message.maxTokens as number | undefined;
      const result = takeSnapshot({ maxTokens });
      logActivity('snapshot', { snapshotId: result.snapshotId });
      return result;
    }

    case 'click': {
      const ref = message.ref as string;
      const result = clickElement(ref);
      logActivity('click', { ref, success: result.success });
      return result;
    }

    case 'typeText': {
      const ref = message.ref as string;
      const text = message.text as string;
      const clearFirst = message.clearFirst as boolean | undefined;
      const result = typeText(ref, text, clearFirst);
      logActivity('typeText', { ref, text: text.slice(0, 20), success: result.success });
      return result;
    }

    case 'selectOption': {
      const ref = message.ref as string;
      const value = message.value as string;
      const result = selectOption(ref, value);
      logActivity('selectOption', { ref, value, success: result.success });
      return result;
    }

    case 'listWebMCPTools': {
      const tabId = (await chrome.runtime.sendMessage({
        channel: 'webclaw-content',
        action: 'getTabId',
      })) as number | undefined;
      const tools = await discoverWebMCPTools(tabId ?? 0);
      logActivity('listWebMCPTools', { count: tools.length });
      return { tools };
    }

    case 'invokeWebMCPTool': {
      const toolName = message.toolName as string;
      const args = message.args as Record<string, unknown>;
      const result = await invokeWebMCPTool(toolName, args);
      logActivity('invokeWebMCPTool', { toolName, success: result.success });
      return result;
    }

    default:
      return { error: `Unknown action: ${action}` };
  }
}

/** Inject the page bridge script into MAIN world */
function injectPageBridge(): void {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('content/page-bridge.js');
  script.type = 'module';
  (document.head || document.documentElement).appendChild(script);
  script.onload = () => script.remove();
}

/** Send activity log to Service Worker for Side Panel display */
function logActivity(action: string, data: Record<string, unknown>): void {
  chrome.runtime.sendMessage({
    channel: 'webclaw-content',
    action: 'log',
    data: {
      action,
      ...data,
      timestamp: Date.now(),
      url: location.href,
    },
  }).catch(() => {
    // Side panel may not be open
  });
}
