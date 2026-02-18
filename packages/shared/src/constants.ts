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
