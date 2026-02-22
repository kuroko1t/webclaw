/**
 * WebClaw MCP Server.
 *
 * Exposes 19 browser interaction tools via MCP protocol (stdio transport).
 * Communicates with the Chrome Extension via WebSocket.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ERROR_RECOVERY } from 'webclaw-shared';
import type { BridgeMessage, BridgeMethod, ErrorCode } from 'webclaw-shared';
import { WebSocketClient } from './ws-client.js';

/** Format an error response with recovery suggestions */
function formatErrorResponse(payload: unknown): {
  content: Array<{ type: 'text'; text: string }>;
  isError: true;
} {
  const errorObj = payload as { code?: string; message?: string };
  const code = errorObj?.code as ErrorCode | undefined;
  const message = errorObj?.message ?? JSON.stringify(payload);
  const recovery = code && ERROR_RECOVERY[code] ? `\nHint: ${ERROR_RECOVERY[code]}` : '';

  return {
    content: [{ type: 'text', text: `${message}${recovery}` }],
    isError: true,
  };
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_VERSION = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8')).version;

export function createWebClawServer(options: { wsClient: WebSocketClient }): McpServer {
  const server = new McpServer({
    name: 'webclaw',
    version: PKG_VERSION,
  });

  const wsClient = options.wsClient;

  // --- Session tab auto-assignment ---
  // Each MCP session gets its own dedicated browser tab, preventing
  // multiple sessions from stomping on each other's active tab.
  let sessionTabId: number | null = null;

  /** Resolve tabId: user-specified > session tab > auto-create new tab */
  async function resolveTabId(requestedTabId?: number): Promise<number> {
    if (requestedTabId !== undefined) return requestedTabId;
    if (sessionTabId !== null) return sessionTabId;
    const response = await wsClient.requestWithRetry('newTab', {});
    if (response.type === 'error') {
      throw new Error('Failed to create session tab');
    }
    const result = response.payload as { tabId: number };
    sessionTabId = result.tabId;
    return sessionTabId;
  }

  /**
   * Send a request using the session tab, with TAB_NOT_FOUND recovery.
   * If the session tab was closed externally, auto-creates a new one and retries.
   */
  async function requestWithSessionTab(
    method: BridgeMethod,
    params: Record<string, unknown>,
    requestedTabId?: number
  ): Promise<BridgeMessage> {
    const resolvedTabId = await resolveTabId(requestedTabId);
    const response = await wsClient.requestWithRetry(method, { ...params, tabId: resolvedTabId });

    if (
      response.type === 'error' &&
      requestedTabId === undefined &&
      sessionTabId !== null
    ) {
      const errorObj = response.payload as { code?: string };
      if (errorObj?.code === 'TAB_NOT_FOUND') {
        sessionTabId = null;
        const newTabId = await resolveTabId(requestedTabId);
        return wsClient.requestWithRetry(method, { ...params, tabId: newTabId });
      }
    }

    return response;
  }

  // --- Tool: navigate_to ---
  server.tool(
    'navigate_to',
    'Navigate the browser to a URL',
    {
      url: z.string().url().describe('The URL to navigate to'),
      tabId: z.number().int().optional().describe('Target tab ID (defaults to active tab)'),
    },
    async ({ url, tabId }) => {
      const response = await requestWithSessionTab('navigate', { url }, tabId);
      if (response.type === 'error') {
        return formatErrorResponse(response.payload);
      }
      const result = response.payload as { url: string; title: string; tabId: number };
      return {
        content: [{ type: 'text', text: `Navigated to: ${result.title}\nURL: ${result.url}\nTab: ${result.tabId}` }],
      };
    }
  );

  // --- Tool: page_snapshot ---
  server.tool(
    'page_snapshot',
    'Get a compact accessibility tree snapshot of the current page with @ref labels for interactive elements',
    {
      tabId: z.number().int().optional().describe('Target tab ID (defaults to active tab)'),
      maxTokens: z.number().int().positive().optional().describe('Maximum token budget for the snapshot (default: 4000)'),
      focusRegion: z.string().optional().describe('Focus on a specific landmark region (e.g., "main", "nav", "header", "footer", "sidebar", "complementary", "banner", "contentinfo")'),
    },
    async ({ tabId, maxTokens, focusRegion }) => {
      const response = await requestWithSessionTab('snapshot', { maxTokens, focusRegion }, tabId);
      if (response.type === 'error') {
        return formatErrorResponse(response.payload);
      }
      const result = response.payload as { text: string; snapshotId: string; url: string; title: string };
      return {
        content: [{
          type: 'text',
          text: `Page: ${result.title}\nURL: ${result.url}\nSnapshot ID: ${result.snapshotId}\n\n${result.text}`,
        }],
      };
    }
  );

  // --- Tool: click ---
  server.tool(
    'click',
    'Click an element identified by its @ref from the latest page snapshot',
    {
      ref: z.string().regex(/^@e\d+$/).describe('Element reference (e.g., @e1, @e2)'),
      snapshotId: z.string().min(1).describe('Snapshot ID from the most recent page_snapshot call'),
      tabId: z.number().int().optional().describe('Target tab ID'),
    },
    async ({ ref, snapshotId, tabId }) => {
      const response = await requestWithSessionTab('click', { ref, snapshotId }, tabId);
      if (response.type === 'error') {
        return formatErrorResponse(response.payload);
      }
      return {
        content: [{ type: 'text', text: `Clicked ${ref}` }],
      };
    }
  );

  // --- Tool: hover ---
  server.tool(
    'hover',
    'Hover over an element to trigger mouseover events and reveal hidden UI (e.g., dropdown menus, tooltips)',
    {
      ref: z.string().regex(/^@e\d+$/).describe('Element reference (e.g., @e1, @e2)'),
      snapshotId: z.string().min(1).describe('Snapshot ID from the most recent page_snapshot call'),
      tabId: z.number().int().optional().describe('Target tab ID'),
    },
    async ({ ref, snapshotId, tabId }) => {
      const response = await requestWithSessionTab('hover', { ref, snapshotId }, tabId);
      if (response.type === 'error') {
        return formatErrorResponse(response.payload);
      }
      return {
        content: [{ type: 'text', text: `Hovered over ${ref}. Take a new page_snapshot to see revealed elements.` }],
      };
    }
  );

  // --- Tool: type_text ---
  server.tool(
    'type_text',
    'Type text into an input element identified by its @ref',
    {
      ref: z.string().regex(/^@e\d+$/).describe('Element reference (e.g., @e1)'),
      text: z.string().describe('Text to type'),
      snapshotId: z.string().min(1).describe('Snapshot ID from the most recent page_snapshot call'),
      clearFirst: z.boolean().optional().describe('Clear existing text before typing (default: true)'),
      tabId: z.number().int().optional().describe('Target tab ID'),
    },
    async ({ ref, text, snapshotId, clearFirst, tabId }) => {
      const response = await requestWithSessionTab('typeText', {
        ref,
        text,
        snapshotId,
        clearFirst,
      }, tabId);
      if (response.type === 'error') {
        return formatErrorResponse(response.payload);
      }
      return {
        content: [{ type: 'text', text: `Typed "${text}" into ${ref}` }],
      };
    }
  );

  // --- Tool: select_option ---
  server.tool(
    'select_option',
    'Select an option in a dropdown/select element by its @ref',
    {
      ref: z.string().regex(/^@e\d+$/).describe('Element reference (e.g., @e1)'),
      value: z.string().describe('Option value or text to select'),
      snapshotId: z.string().min(1).describe('Snapshot ID from the most recent page_snapshot call'),
      tabId: z.number().int().optional().describe('Target tab ID'),
    },
    async ({ ref, value, snapshotId, tabId }) => {
      const response = await requestWithSessionTab('selectOption', {
        ref,
        value,
        snapshotId,
      }, tabId);
      if (response.type === 'error') {
        return formatErrorResponse(response.payload);
      }
      return {
        content: [{ type: 'text', text: `Selected "${value}" in ${ref}` }],
      };
    }
  );

  // --- Tool: list_webmcp_tools ---
  server.tool(
    'list_webmcp_tools',
    'List all WebMCP tools available on the current page (both native and auto-synthesized)',
    {
      tabId: z.number().int().optional().describe('Target tab ID'),
    },
    async ({ tabId }) => {
      const response = await requestWithSessionTab('listWebMCPTools', {}, tabId);
      if (response.type === 'error') {
        return formatErrorResponse(response.payload);
      }
      const result = response.payload as { tools: Array<{ name: string; description: string; source: string; inputSchema: unknown }> };
      const toolList = result.tools
        .map((t) => `- ${t.name} [${t.source}]: ${t.description}`)
        .join('\n');
      return {
        content: [{
          type: 'text',
          text: result.tools.length > 0
            ? `Found ${result.tools.length} tools:\n${toolList}`
            : 'No WebMCP tools found on this page.',
        }],
      };
    }
  );

  // --- Tool: invoke_webmcp_tool ---
  server.tool(
    'invoke_webmcp_tool',
    'Invoke a WebMCP tool declared by the current page',
    {
      toolName: z.string().min(1).describe('Name of the WebMCP tool to invoke'),
      args: z.record(z.unknown()).describe('Arguments to pass to the tool'),
      tabId: z.number().int().optional().describe('Target tab ID'),
    },
    async ({ toolName, args, tabId }) => {
      const response = await requestWithSessionTab('invokeWebMCPTool', {
        toolName,
        args,
      }, tabId);
      if (response.type === 'error') {
        return formatErrorResponse(response.payload);
      }
      const result = response.payload as { success: boolean; result?: unknown; error?: string };
      if (!result.success) {
        return {
          content: [{ type: 'text', text: `Tool execution failed: ${result.error}` }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(result.result, null, 2) }],
      };
    }
  );

  // --- Tool: screenshot ---
  server.tool(
    'screenshot',
    'Capture a screenshot of the current visible tab',
    {
      tabId: z.number().int().optional().describe('Target tab ID'),
    },
    async ({ tabId }) => {
      const response = await requestWithSessionTab('screenshot', {}, tabId);
      if (response.type === 'error') {
        return formatErrorResponse(response.payload);
      }
      const result = response.payload as { dataUrl: string; tabId: number };
      // Extract base64 data from data URL
      const base64 = result.dataUrl.replace(/^data:image\/png;base64,/, '');
      return {
        content: [{
          type: 'image',
          data: base64,
          mimeType: 'image/png',
        }],
      };
    }
  );

  // --- Tool: new_tab ---
  server.tool(
    'new_tab',
    'Open a new browser tab',
    {
      url: z.string().url().optional().describe('URL to open (defaults to new tab page)'),
    },
    async ({ url }) => {
      const response = await wsClient.requestWithRetry('newTab', { url });
      if (response.type === 'error') {
        return formatErrorResponse(response.payload);
      }
      const result = response.payload as { tabId: number; url: string; title: string };
      return {
        content: [{
          type: 'text',
          text: `Opened new tab (${result.tabId})${result.url ? `\nURL: ${result.url}` : ''}${result.title ? `\nTitle: ${result.title}` : ''}`,
        }],
      };
    }
  );

  // --- Tool: list_tabs ---
  server.tool(
    'list_tabs',
    'List all open browser tabs',
    {},
    async () => {
      const response = await wsClient.requestWithRetry('listTabs', {});
      if (response.type === 'error') {
        return formatErrorResponse(response.payload);
      }
      const result = response.payload as {
        tabs: Array<{ tabId: number; url: string; title: string; active: boolean }>;
      };
      const tabList = result.tabs
        .map((t) => `${t.active ? '* ' : '  '}[${t.tabId}] ${t.title ?? '(no title)'} - ${t.url ?? '(no url)'}`)
        .join('\n');
      return {
        content: [{
          type: 'text',
          text: `${result.tabs.length} tabs:\n${tabList}`,
        }],
      };
    }
  );

  // --- Tool: switch_tab ---
  server.tool(
    'switch_tab',
    'Switch to a specific browser tab',
    {
      tabId: z.number().int().describe('Tab ID to switch to'),
    },
    async ({ tabId }) => {
      const response = await wsClient.requestWithRetry('switchTab', { tabId });
      if (response.type === 'error') {
        return formatErrorResponse(response.payload);
      }
      const result = response.payload as { tabId: number; url: string; title: string };
      return {
        content: [{
          type: 'text',
          text: `Switched to tab ${result.tabId}: ${result.title}\nURL: ${result.url}`,
        }],
      };
    }
  );

  // --- Tool: close_tab ---
  server.tool(
    'close_tab',
    'Close a browser tab',
    {
      tabId: z.number().int().describe('Tab ID to close'),
    },
    async ({ tabId }) => {
      const response = await wsClient.requestWithRetry('closeTab', { tabId });
      if (response.type === 'error') {
        return formatErrorResponse(response.payload);
      }
      return {
        content: [{ type: 'text', text: `Closed tab ${tabId}` }],
      };
    }
  );

  // --- Tool: go_back ---
  server.tool(
    'go_back',
    'Navigate back in browser history',
    {
      tabId: z.number().int().optional().describe('Target tab ID (defaults to active tab)'),
    },
    async ({ tabId }) => {
      const response = await requestWithSessionTab('goBack', {}, tabId);
      if (response.type === 'error') {
        return formatErrorResponse(response.payload);
      }
      const result = response.payload as { url: string; title: string; tabId: number };
      return {
        content: [{ type: 'text', text: `Went back to: ${result.title}\nURL: ${result.url}` }],
      };
    }
  );

  // --- Tool: go_forward ---
  server.tool(
    'go_forward',
    'Navigate forward in browser history',
    {
      tabId: z.number().int().optional().describe('Target tab ID (defaults to active tab)'),
    },
    async ({ tabId }) => {
      const response = await requestWithSessionTab('goForward', {}, tabId);
      if (response.type === 'error') {
        return formatErrorResponse(response.payload);
      }
      const result = response.payload as { url: string; title: string; tabId: number };
      return {
        content: [{ type: 'text', text: `Went forward to: ${result.title}\nURL: ${result.url}` }],
      };
    }
  );

  // --- Tool: reload ---
  server.tool(
    'reload',
    'Reload the current page',
    {
      tabId: z.number().int().optional().describe('Target tab ID (defaults to active tab)'),
      bypassCache: z.boolean().optional().describe('Bypass browser cache (default: false)'),
    },
    async ({ tabId, bypassCache }) => {
      const response = await requestWithSessionTab('reload', { bypassCache }, tabId);
      if (response.type === 'error') {
        return formatErrorResponse(response.payload);
      }
      const result = response.payload as { url: string; title: string; tabId: number };
      return {
        content: [{ type: 'text', text: `Reloaded: ${result.title}\nURL: ${result.url}` }],
      };
    }
  );

  // --- Tool: wait_for_navigation ---
  server.tool(
    'wait_for_navigation',
    'Wait for the current page to finish loading',
    {
      tabId: z.number().int().optional().describe('Target tab ID (defaults to active tab)'),
      timeoutMs: z.number().int().positive().optional().describe('Maximum wait time in milliseconds (default: 30000)'),
    },
    async ({ tabId, timeoutMs }) => {
      const response = await requestWithSessionTab('waitForNavigation', { timeoutMs }, tabId);
      if (response.type === 'error') {
        return formatErrorResponse(response.payload);
      }
      const result = response.payload as { url: string; title: string; tabId: number };
      return {
        content: [{ type: 'text', text: `Page loaded: ${result.title}\nURL: ${result.url}` }],
      };
    }
  );

  // --- Tool: scroll_page ---
  server.tool(
    'scroll_page',
    'Scroll the page or scroll to a specific element',
    {
      tabId: z.number().int().optional().describe('Target tab ID (defaults to active tab)'),
      direction: z.enum(['up', 'down']).optional().describe('Scroll direction (default: down)'),
      amount: z.number().int().positive().optional().describe('Scroll amount in pixels (default: viewport height)'),
      ref: z.string().regex(/^@e\d+$/).optional().describe('Element reference to scroll to (e.g., @e5)'),
      snapshotId: z.string().min(1).optional().describe('Snapshot ID (required when using ref)'),
    },
    async ({ tabId, direction, amount, ref, snapshotId }) => {
      const response = await requestWithSessionTab('scrollPage', {
        direction,
        amount,
        ref,
        snapshotId,
      }, tabId);
      if (response.type === 'error') {
        return formatErrorResponse(response.payload);
      }
      if (ref) {
        return {
          content: [{ type: 'text', text: `Scrolled to element ${ref}` }],
        };
      }
      return {
        content: [{ type: 'text', text: `Scrolled ${direction ?? 'down'}` }],
      };
    }
  );

  // --- Tool: drop_files ---
  server.tool(
    'drop_files',
    'Drop files onto an element (file input or drag-and-drop target) for uploading',
    {
      ref: z.string().regex(/^@e\d+$/).describe('Element reference (e.g., @e1)'),
      snapshotId: z.string().min(1).describe('Snapshot ID from the most recent page_snapshot call'),
      files: z.array(z.object({
        name: z.string().min(1).describe('File name (e.g., "image.png")'),
        mimeType: z.string().min(1).describe('MIME type (e.g., "image/png")'),
        base64Data: z.string().optional().describe('Base64-encoded file content'),
        filePath: z.string().optional().describe('Local file path (alternative to base64Data — the server reads the file)'),
      })).min(1).describe('Files to drop'),
      tabId: z.number().int().optional().describe('Target tab ID'),
    },
    async ({ ref, snapshotId, files, tabId }) => {
      // Resolve filePath → base64Data for each file entry
      const resolvedFiles = files.map((f) => {
        if (f.base64Data) {
          return { name: f.name, mimeType: f.mimeType, base64Data: f.base64Data };
        }
        if (f.filePath) {
          const data = readFileSync(f.filePath);
          return { name: f.name, mimeType: f.mimeType, base64Data: data.toString('base64') };
        }
        throw new Error(`File "${f.name}": either base64Data or filePath must be provided`);
      });

      const response = await requestWithSessionTab('dropFiles', {
        ref,
        snapshotId,
        files: resolvedFiles,
      }, tabId);
      if (response.type === 'error') {
        return formatErrorResponse(response.payload);
      }
      const fileNames = files.map((f) => f.name).join(', ');
      return {
        content: [{ type: 'text', text: `Dropped ${files.length} file(s) onto ${ref}: ${fileNames}` }],
      };
    }
  );

  return server;
}
