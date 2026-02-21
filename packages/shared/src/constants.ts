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

/** Default snapshot token budget */
export const DEFAULT_SNAPSHOT_MAX_TOKENS = 4000;

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
  ping: 5_000,
};

/** Maximum number of retry attempts for transient failures */
export const MAX_RETRY_ATTEMPTS = 2;

/** Base delay in ms for exponential backoff between retries */
export const RETRY_BASE_DELAY_MS = 500;
