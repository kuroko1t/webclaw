/**
 * WebClaw MCP Server.
 *
 * Exposes 8 browser interaction tools via MCP protocol (stdio transport).
 * Communicates with the Chrome Extension via WebSocket.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { WebSocketClient } from './ws-client.js';

export function createWebClawServer(options: { wsClient: WebSocketClient }): McpServer {
  const server = new McpServer({
    name: 'webclaw',
    version: '0.2.1',
  });

  const wsClient = options.wsClient;

  // --- Tool: navigate_to ---
  server.tool(
    'navigate_to',
    'Navigate the browser to a URL',
    {
      url: z.string().url().describe('The URL to navigate to'),
      tabId: z.number().int().optional().describe('Target tab ID (defaults to active tab)'),
    },
    async ({ url, tabId }) => {
      const response = await wsClient.request('navigate', { url, tabId });
      if (response.type === 'error') {
        return {
          content: [{ type: 'text', text: `Navigation failed: ${JSON.stringify(response.payload)}` }],
          isError: true,
        };
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
    },
    async ({ tabId, maxTokens }) => {
      const response = await wsClient.request('snapshot', { tabId, maxTokens });
      if (response.type === 'error') {
        return {
          content: [{ type: 'text', text: `Snapshot failed: ${JSON.stringify(response.payload)}` }],
          isError: true,
        };
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
      const response = await wsClient.request('click', { ref, snapshotId, tabId });
      if (response.type === 'error') {
        return {
          content: [{ type: 'text', text: `Click failed: ${JSON.stringify(response.payload)}` }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `Clicked ${ref}` }],
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
      const response = await wsClient.request('typeText', {
        ref,
        text,
        snapshotId,
        clearFirst,
        tabId,
      });
      if (response.type === 'error') {
        return {
          content: [{ type: 'text', text: `Type failed: ${JSON.stringify(response.payload)}` }],
          isError: true,
        };
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
      const response = await wsClient.request('selectOption', {
        ref,
        value,
        snapshotId,
        tabId,
      });
      if (response.type === 'error') {
        return {
          content: [{ type: 'text', text: `Select failed: ${JSON.stringify(response.payload)}` }],
          isError: true,
        };
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
      const response = await wsClient.request('listWebMCPTools', { tabId });
      if (response.type === 'error') {
        return {
          content: [{ type: 'text', text: `List tools failed: ${JSON.stringify(response.payload)}` }],
          isError: true,
        };
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
      const response = await wsClient.request('invokeWebMCPTool', {
        toolName,
        args,
        tabId,
      });
      if (response.type === 'error') {
        return {
          content: [{ type: 'text', text: `Invoke failed: ${JSON.stringify(response.payload)}` }],
          isError: true,
        };
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
      const response = await wsClient.request('screenshot', { tabId });
      if (response.type === 'error') {
        return {
          content: [{ type: 'text', text: `Screenshot failed: ${JSON.stringify(response.payload)}` }],
          isError: true,
        };
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

  return server;
}
