/**
 * MCP tool definitions for the WebClaw server.
 */

/** Parameters for navigate_to tool */
export interface NavigateToParams {
  url: string;
  tabId?: number;
}

/** Parameters for page_snapshot tool */
export interface PageSnapshotParams {
  tabId?: number;
  maxTokens?: number;
}

/** Parameters for click tool */
export interface ClickParams {
  ref: string;
  snapshotId: string;
  tabId?: number;
}

/** Parameters for type_text tool */
export interface TypeTextParams {
  ref: string;
  text: string;
  snapshotId: string;
  clearFirst?: boolean;
  tabId?: number;
}

/** Parameters for select_option tool */
export interface SelectOptionParams {
  ref: string;
  value: string;
  snapshotId: string;
  tabId?: number;
}

/** Parameters for list_webmcp_tools tool */
export interface ListWebMCPToolsParams {
  tabId?: number;
}

/** Parameters for invoke_webmcp_tool tool */
export interface InvokeWebMCPToolParams {
  toolName: string;
  args: Record<string, unknown>;
  tabId?: number;
}

/** Parameters for screenshot tool */
export interface ScreenshotParams {
  tabId?: number;
  fullPage?: boolean;
}

/** Screenshot result */
export interface ScreenshotResult {
  dataUrl: string;
  width: number;
  height: number;
}

/** Parameters for new_tab tool */
export interface NewTabParams {
  url?: string;
}

/** Parameters for list_tabs tool */
export interface ListTabsParams {}

/** Parameters for switch_tab tool */
export interface SwitchTabParams {
  tabId: number;
}

/** Parameters for close_tab tool */
export interface CloseTabParams {
  tabId: number;
}

/** Parameters for go_back tool */
export interface GoBackParams {
  tabId?: number;
}

/** Parameters for go_forward tool */
export interface GoForwardParams {
  tabId?: number;
}

/** Parameters for reload tool */
export interface ReloadParams {
  tabId?: number;
  bypassCache?: boolean;
}

/** Parameters for wait_for_navigation tool */
export interface WaitForNavigationParams {
  tabId?: number;
  timeoutMs?: number;
}

/** Parameters for scroll_page tool */
export interface ScrollPageParams {
  tabId?: number;
  direction?: 'up' | 'down';
  amount?: number;
  ref?: string;
  snapshotId?: string;
}
