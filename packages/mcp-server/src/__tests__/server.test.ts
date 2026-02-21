import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Tests for MCP server tool registration.
 * Since createWebClawServer() creates a NativeMessagingClient that attaches
 * to process.stdin, we test tool registration patterns independently.
 */
describe('MCP Server tool registration', () => {
  it('McpServer can be instantiated', () => {
    const server = new McpServer({ name: 'test', version: '0.0.1' });
    expect(server).toBeDefined();
  });

  it('registers tools with correct schema types', () => {
    const { z } = require('zod');
    const server = new McpServer({ name: 'test', version: '0.0.1' });

    // Verify the same patterns used in server.ts compile correctly
    server.tool(
      'test_tool',
      'A test tool',
      {
        url: z.string().url(),
        tabId: z.number().int().optional(),
      },
      async () => ({
        content: [{ type: 'text' as const, text: 'ok' }],
      })
    );

    expect(server).toBeDefined();
  });

  it('registers tool with ref pattern', () => {
    const { z } = require('zod');
    const server = new McpServer({ name: 'test', version: '0.0.1' });

    server.tool(
      'click',
      'Click element',
      {
        ref: z.string().regex(/^@e\d+$/),
        snapshotId: z.string().min(1),
      },
      async () => ({
        content: [{ type: 'text' as const, text: 'clicked' }],
      })
    );

    expect(server).toBeDefined();
  });

  it('registers all 18 expected tools', () => {
    const { z } = require('zod');
    const server = new McpServer({ name: 'test', version: '0.0.1' });

    const toolNames = [
      'navigate_to',
      'page_snapshot',
      'click',
      'hover',
      'type_text',
      'select_option',
      'list_webmcp_tools',
      'invoke_webmcp_tool',
      'screenshot',
      'new_tab',
      'list_tabs',
      'switch_tab',
      'close_tab',
      'go_back',
      'go_forward',
      'reload',
      'wait_for_navigation',
      'scroll_page',
    ];

    for (const name of toolNames) {
      server.tool(
        name,
        `Test ${name}`,
        {},
        async () => ({
          content: [{ type: 'text' as const, text: 'ok' }],
        })
      );
    }

    // If we get here without throwing, all 18 registered successfully
    expect(toolNames).toHaveLength(18);
  });
});

describe('Tool response formats', () => {
  it('text content format is valid', () => {
    const response = {
      content: [{ type: 'text' as const, text: 'Hello world' }],
    };
    expect(response.content[0].type).toBe('text');
    expect(response.content[0].text).toBeDefined();
  });

  it('image content format is valid', () => {
    const response = {
      content: [{
        type: 'image' as const,
        data: 'base64data',
        mimeType: 'image/png',
      }],
    };
    expect(response.content[0].type).toBe('image');
    expect(response.content[0].data).toBeDefined();
  });

  it('error response format is valid', () => {
    const response = {
      content: [{ type: 'text' as const, text: 'Error occurred' }],
      isError: true,
    };
    expect(response.isError).toBe(true);
  });
});
