/**
 * WebClaw Chrome Extension Service Worker.
 *
 * Acts as the message hub between:
 * - WebSocket (MCP Server) ↔ Content Scripts (page interaction)
 * - Content Scripts ↔ Side Panel (activity logging)
 */
import {
  WEBSOCKET_DEFAULT_PORT,
  KEEPALIVE_INTERVAL_MS,
} from 'webclaw-shared';
import { WebSocketBridge } from './ws-bridge';
import { TabManager } from './tab-manager';
import { MessageRouter } from './message-router';

// --- State ---
const tabManager = new TabManager();
const messageRouter = new MessageRouter(tabManager);
const wsBridge = new WebSocketBridge(
  `ws://127.0.0.1:${WEBSOCKET_DEFAULT_PORT}`,
  messageRouter
);

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

export { messageRouter, tabManager, wsBridge, broadcastToSidePanel };
