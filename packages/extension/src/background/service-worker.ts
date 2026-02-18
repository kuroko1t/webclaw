/**
 * WebClaw Chrome Extension Service Worker.
 *
 * Acts as the message hub between:
 * - Native Messaging (MCP Server) ↔ Content Scripts (page interaction)
 * - Content Scripts ↔ Side Panel (activity logging)
 */
import {
  NATIVE_MESSAGING_HOST,
  KEEPALIVE_INTERVAL_MS,
} from '@webclaw/shared';
import { NativeMessagingBridge } from './native-messaging-bridge';
import { TabManager } from './tab-manager';
import { MessageRouter } from './message-router';

// --- State ---
let nativeBridge: NativeMessagingBridge | null = null;
const tabManager = new TabManager();
const messageRouter = new MessageRouter(tabManager);

// --- Keepalive ---
chrome.alarms.create('webclaw-keepalive', {
  periodInMinutes: KEEPALIVE_INTERVAL_MS / 60_000,
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'webclaw-keepalive') {
    // Keep service worker alive by performing a trivial operation
    void chrome.storage.session.get('keepalive');
  }
});

// --- Native Messaging ---
chrome.runtime.onConnectExternal.addListener((port) => {
  // External connections from other extensions (future use)
  console.log('[WebClaw] External connection from:', port.sender?.id);
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  console.log('[WebClaw] External message:', message);
  sendResponse({ ok: true });
});

// Listen for native messaging connections
chrome.runtime.onConnectNative?.addListener((port) => {
  console.log('[WebClaw] Native messaging connected');
  nativeBridge = new NativeMessagingBridge(port, messageRouter);
});

// Fallback: listen on named native messaging port
function connectNativeHost(): void {
  try {
    const port = chrome.runtime.connectNative(NATIVE_MESSAGING_HOST);
    console.log('[WebClaw] Connected to native host');
    nativeBridge = new NativeMessagingBridge(port, messageRouter);

    port.onDisconnect.addListener(() => {
      console.log(
        '[WebClaw] Native host disconnected:',
        chrome.runtime.lastError?.message
      );
      nativeBridge = null;
    });
  } catch (err) {
    console.error('[WebClaw] Failed to connect native host:', err);
  }
}

// --- Content Script Messages ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.channel === 'webclaw-content') {
    messageRouter.handleContentScriptMessage(message, sender, sendResponse);
    return true; // Keep channel open for async response
  }

  if (message.channel === 'webclaw-sidepanel') {
    // Forward to side panel
    broadcastToSidePanel(message);
    sendResponse({ ok: true });
    return false;
  }
});

// --- Side Panel ---
function broadcastToSidePanel(message: unknown): void {
  chrome.runtime.sendMessage({ channel: 'webclaw-sidepanel-update', ...message as object }).catch(() => {
    // Side panel may not be open
  });
}

// --- Tab Events ---
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') {
    tabManager.onTabReady(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabManager.onTabRemoved(tabId);
});

// --- Side Panel Setup ---
chrome.sidePanel?.setOptions({
  enabled: true,
}).catch(() => {
  // sidePanel API may not be available
});

// --- Action Click → open side panel ---
chrome.action?.onClicked?.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel?.open({ tabId: tab.id }).catch(console.error);
  }
});

// --- Startup ---
console.log('[WebClaw] Service Worker started');

// Export for message router to trigger native messaging connection
export function ensureNativeConnection(): NativeMessagingBridge | null {
  if (!nativeBridge) {
    connectNativeHost();
  }
  return nativeBridge;
}

export { messageRouter, tabManager, nativeBridge, broadcastToSidePanel };
