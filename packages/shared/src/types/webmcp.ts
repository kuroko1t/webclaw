/**
 * WebMCP (Web Model Context Protocol) type definitions.
 * Based on the W3C WebMCP specification (Chrome 146+).
 */

/** JSON Schema type for tool input definitions */
export interface JSONSchema {
  type?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: unknown[];
  description?: string;
  default?: unknown;
  [key: string]: unknown;
}

/** Source of a WebMCP tool discovery */
export type WebMCPToolSource =
  | 'webmcp-native'
  | 'synthesized-form'
  | 'synthesized-button'
  | 'synthesized-link'
  | 'synthesized-input';

/** A tool discovered via WebMCP or auto-synthesis */
export interface WebMCPTool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  source: WebMCPToolSource;
  tabId: number;
  elementRef?: string;
}

/** Result of invoking a WebMCP tool */
export interface WebMCPToolResult {
  success: boolean;
  content?: unknown;
  error?: string;
}

/** WebMCP server declaration from a page */
export interface WebMCPServerInfo {
  name: string;
  version: string;
  tools: WebMCPTool[];
}
