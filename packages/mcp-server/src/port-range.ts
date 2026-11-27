/**
 * Facts about where a server's port sits in the range the extension scans.
 */
import {
  WEBSOCKET_DEFAULT_PORT,
  WEBSOCKET_PORT_RANGE_SIZE,
  WEBSOCKET_LEGACY_PORT_RANGE_SIZE,
  WIDE_PORT_RANGE_EXTENSION_VERSION,
  RECONNECT_FAST_PORT_COUNT,
  RECONNECT_SLOW_INTERVAL_MS,
} from 'webclaw-shared';

/**
 * Extra time on top of the extension's slow retry interval. Chrome delays a
 * WebSocket connection by up to 5 seconds when the extension has many failed
 * connections recently (it always has, from probing free ports), so the
 * extension may connect up to slow interval + 5s after the server starts.
 */
const SLOW_PORT_WAIT_MARGIN_MS = 10_000;

const RANGE_END = WEBSOCKET_DEFAULT_PORT + WEBSOCKET_PORT_RANGE_SIZE; // exclusive
const LEGACY_END = WEBSOCKET_DEFAULT_PORT + WEBSOCKET_LEGACY_PORT_RANGE_SIZE; // exclusive

/**
 * Note for ports that only newer extensions connect to, or null.
 * Older extensions scan only the first WEBSOCKET_LEGACY_PORT_RANGE_SIZE ports.
 */
export function widePortRangeNote(port: number): string | null {
  if (port < LEGACY_END || port >= RANGE_END) return null;
  return (
    `Port ${port} is above ${WEBSOCKET_DEFAULT_PORT}–${LEGACY_END - 1}: ` +
    `only WebClaw extension v${WIDE_PORT_RANGE_EXTENSION_VERSION} or later connects to it. ` +
    `Update the extension if it does not connect.`
  );
}

/**
 * How long to wait for the extension before launching Chrome.
 *
 * A server that picked its port by scanning sits on the lowest free port, one
 * the extension retries every few seconds, so Chrome is launched right away as
 * before (0). A port set with WEBCLAW_PORT may be one the extension only
 * retries at the slow interval; launching Chrome while it is already running
 * would only open another window, so wait one slow interval first.
 */
export function preLaunchWaitMs(port: number, explicitPort: boolean): number {
  if (!explicitPort) return 0;
  if (port < WEBSOCKET_DEFAULT_PORT + RECONNECT_FAST_PORT_COUNT || port >= RANGE_END) return 0;
  return RECONNECT_SLOW_INTERVAL_MS + SLOW_PORT_WAIT_MARGIN_MS;
}
