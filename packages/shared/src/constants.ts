/**
 * Shared constants for WebClaw.
 */

/** Native Messaging host name (must match manifest) */
export const NATIVE_MESSAGING_HOST = 'com.webclaw.bridge';

/** Extension ID placeholder (set during build/install) */
export const EXTENSION_ID_PLACEHOLDER = 'WEBCLAW_EXTENSION_ID';

/** Maximum Native Messaging payload size (1MB) */
export const NATIVE_MESSAGING_MAX_SIZE = 1024 * 1024;

/** Service Worker keepalive interval in ms (25 seconds, under 30s limit) */
export const KEEPALIVE_INTERVAL_MS = 25_000;


/** Content script ↔ page context message channel */
export const PAGE_BRIDGE_CHANNEL = 'webclaw-page-bridge';

/** Side panel message type prefix */
export const SIDE_PANEL_PREFIX = 'webclaw-sidepanel';

/** Default WebSocket port for MCP ↔ Extension communication */
export const WEBSOCKET_DEFAULT_PORT = 18080;

/** Number of ports to scan for multi-session support (18080–18089) */
export const WEBSOCKET_PORT_RANGE_SIZE = 10;

/** Environment variable to override the WebSocket port */
export const WEBSOCKET_PORT_ENV = 'WEBCLAW_PORT';

/** Environment variable selecting the Chrome profile directory to open when auto-launching Chrome */
export const CHROME_PROFILE_ENV = 'WEBCLAW_CHROME_PROFILE';

/** Operation-specific timeouts in milliseconds */
export const OPERATION_TIMEOUTS: Record<string, number> = {
  navigate: 30_000,
  newTab: 30_000,
  goBack: 30_000,
  goForward: 30_000,
  reload: 30_000,
  waitForNavigation: 30_000,
  snapshot: 15_000,
  click: 10_000,
  hover: 10_000,
  typeText: 10_000,
  selectOption: 10_000,
  screenshot: 15_000,
  listTabs: 5_000,
  switchTab: 5_000,
  closeTab: 5_000,
  listWebMCPTools: 10_000,
  invokeWebMCPTool: 30_000,
  scrollPage: 10_000,
  dropFiles: 30_000,
  handleDialog: 10_000,
  evaluate: 30_000,
  ping: 5_000,
};

/**
 * Time budget for typing with trusted key presses (type_text with
 * pressKeys): a fixed part plus a per-key allowance. The extension stops
 * typing once this budget is used up so it can report a non-retryable error
 * before the MCP server's request timeout fires.
 */
export const TRUSTED_TYPING_BASE_MS = 5_000;
export const TRUSTED_TYPING_PER_KEY_MS = 250;

/** Number of characters that type_text may send as key presses. */
export function countKeyPresses(text: string): number {
  const m = text.replace(/\r\n?/g, '\n').match(/[\n\t,]/g);
  return m ? m.length : 0;
}

/** Budget the extension may spend on trusted typing for `text`. */
export function trustedTypingBudgetMs(text: string): number {
  return TRUSTED_TYPING_BASE_MS + countKeyPresses(text) * TRUSTED_TYPING_PER_KEY_MS;
}

/**
 * MCP-side timeout for a type_text request. Without pressKeys this is the
 * plain typeText timeout; with pressKeys the trusted typing budget is added
 * on top so the extension always gives up first.
 */
export function typeTextTimeoutMs(text: string, pressKeys?: boolean): number {
  const base = OPERATION_TIMEOUTS.typeText;
  return pressKeys ? base + trustedTypingBudgetMs(text) : base;
}

/** Maximum number of retry attempts for transient failures */
export const MAX_RETRY_ATTEMPTS = 2;

/** Base delay in ms for exponential backoff between retries */
export const RETRY_BASE_DELAY_MS = 500;
