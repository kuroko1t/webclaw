/**
 * Error codes and recovery messages for WebClaw.
 */

/** Standard error codes used across the bridge protocol */
export type ErrorCode =
  | 'CONNECTION_LOST'
  | 'TAB_NOT_FOUND'
  | 'STALE_SNAPSHOT'
  | 'NAVIGATION_TIMEOUT'
  | 'NO_ACTIVE_TAB'
  | 'UNKNOWN_METHOD'
  | 'HANDLER_ERROR'
  | 'CONTENT_SCRIPT_ERROR'
  | 'SCREENSHOT_FAILED';

/** Map of error codes to human-readable recovery suggestions */
export const ERROR_RECOVERY: Record<ErrorCode, string> = {
  CONNECTION_LOST:
    'The connection to the Chrome extension was lost. It should reconnect automatically. If not, try reloading the extension.',
  TAB_NOT_FOUND:
    'The specified tab was not found. Use list_tabs to see available tabs.',
  STALE_SNAPSHOT:
    'The snapshot is stale because the page has changed. Take a new page_snapshot before interacting with elements.',
  NAVIGATION_TIMEOUT:
    'Navigation timed out. The page may still be loading. Try wait_for_navigation or reload.',
  NO_ACTIVE_TAB:
    'No active tab found. Use new_tab to open a page or list_tabs to check available tabs.',
  UNKNOWN_METHOD:
    'The requested method is not supported. Check the tool name and try again.',
  HANDLER_ERROR:
    'An internal error occurred while processing the request. Try again or take a new snapshot.',
  CONTENT_SCRIPT_ERROR:
    'The content script encountered an error. Try reloading the page and taking a new snapshot.',
  SCREENSHOT_FAILED:
    'Failed to capture a screenshot. Ensure the tab is visible and not a chrome:// page.',
};
