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
