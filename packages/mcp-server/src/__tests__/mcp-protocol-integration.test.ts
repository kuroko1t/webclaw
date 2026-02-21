/**
 * MCP Protocol in-process integration tests.
 *
 * Uses MCP SDK Client + InMemoryTransport to perform a real protocol
 * handshake and tool invocations against the actual server, with a
 * mocked WebSocketClient.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createWebClawServer } from '../server.js';
import type { WebSocketClient } from '../ws-client.js';
import type { BridgeMessage, BridgeMethod } from 'webclaw-shared';

/** Create a mock WebSocketClient that resolves requests with a handler. */
function createMockWsClient(): {
  wsClient: WebSocketClient;
  setHandler: (fn: (method: string, payload: unknown) => BridgeMessage) => void;
} {
  let handler: ((method: string, payload: unknown) => BridgeMessage) | null = null;

  const requestImpl = vi.fn(async (method: BridgeMethod, payload: unknown = {}) => {
    if (handler) {
      return handler(method, payload);
    }
    // Default: return a response
    return {
      id: 'mock-id',
      type: 'response' as const,
      method,
      payload: {},
      timestamp: Date.now(),
    };
  });

  const wsClient = {
    request: requestImpl,
    requestWithRetry: requestImpl,
    isConnected: vi.fn(() => true),
    close: vi.fn(async () => {}),
  } as unknown as WebSocketClient;

  return {
    wsClient,
    setHandler: (fn) => { handler = fn; },
  };
}

const EXPECTED_TOOLS = [
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
  'drop_files',
];

describe('MCP Protocol integration (in-process)', () => {
  let mcpClient: Client;
  let mockWs: ReturnType<typeof createMockWsClient>;

  beforeAll(async () => {
    mockWs = createMockWsClient();

    const server = createWebClawServer({ wsClient: mockWs.wsClient });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    mcpClient = new Client({ name: 'test-client', version: '0.0.1' });

    await server.connect(serverTransport);
    await mcpClient.connect(clientTransport);
  });

  afterAll(async () => {
    await mcpClient.close();
  });

  // --- Handshake ---
  it('completes initialize handshake and returns server info', () => {
    const serverVersion = mcpClient.getServerVersion();
    expect(serverVersion).toBeDefined();
    expect(serverVersion!.name).toBe('webclaw');
    expect(serverVersion!.version).toBe('0.7.0');
  });

  // --- tools/list ---
  it('lists all 19 tools', async () => {
    const result = await mcpClient.listTools();
    expect(result.tools).toHaveLength(19);
    const names = result.tools.map((t) => t.name).sort();
    expect(names).toEqual([...EXPECTED_TOOLS].sort());
  });

  it('each tool has a non-empty description', async () => {
    const result = await mcpClient.listTools();
    for (const tool of result.tools) {
      expect(tool.description).toBeTruthy();
    }
  });

  // --- Input schema validation ---
  it('navigate_to schema requires url string', async () => {
    const { tools } = await mcpClient.listTools();
    const nav = tools.find((t) => t.name === 'navigate_to')!;
    expect(nav.inputSchema.properties).toHaveProperty('url');
    expect(nav.inputSchema.required).toContain('url');
  });

  it('click schema requires ref with pattern and snapshotId', async () => {
    const { tools } = await mcpClient.listTools();
    const click = tools.find((t) => t.name === 'click')!;
    expect(click.inputSchema.properties).toHaveProperty('ref');
    expect(click.inputSchema.properties).toHaveProperty('snapshotId');
    expect(click.inputSchema.required).toContain('ref');
    expect(click.inputSchema.required).toContain('snapshotId');
  });

  it('type_text schema requires ref, text, snapshotId', async () => {
    const { tools } = await mcpClient.listTools();
    const tt = tools.find((t) => t.name === 'type_text')!;
    expect(tt.inputSchema.required).toContain('ref');
    expect(tt.inputSchema.required).toContain('text');
    expect(tt.inputSchema.required).toContain('snapshotId');
  });

  it('select_option schema requires ref, value, snapshotId', async () => {
    const { tools } = await mcpClient.listTools();
    const so = tools.find((t) => t.name === 'select_option')!;
    expect(so.inputSchema.required).toContain('ref');
    expect(so.inputSchema.required).toContain('value');
    expect(so.inputSchema.required).toContain('snapshotId');
  });

  it('screenshot schema has optional tabId only', async () => {
    const { tools } = await mcpClient.listTools();
    const ss = tools.find((t) => t.name === 'screenshot')!;
    expect(ss.inputSchema.properties).toHaveProperty('tabId');
    // tabId is optional, so required should be empty or not contain tabId
    expect(ss.inputSchema.required ?? []).not.toContain('tabId');
  });

  // --- Validation errors ---
  it('navigate_to rejects invalid URL', async () => {
    const result = await mcpClient.callTool({
      name: 'navigate_to',
      arguments: { url: 'not-a-url' },
    });
    expect(result.isError).toBe(true);
  });

  it('click rejects invalid ref pattern', async () => {
    const result = await mcpClient.callTool({
      name: 'click',
      arguments: { ref: 'bad-ref', snapshotId: 'snap-1' },
    });
    expect(result.isError).toBe(true);
  });

  // --- Tool invocation with mock WebSocketClient ---
  it('navigate_to returns formatted response from ws client', async () => {
    mockWs.setHandler((method) => ({
      id: 'mock-id',
      type: 'response',
      method,
      payload: {
        url: 'https://example.com',
        title: 'Example Domain',
        tabId: 1,
      },
      timestamp: Date.now(),
    }));

    const result = await mcpClient.callTool({
      name: 'navigate_to',
      arguments: { url: 'https://example.com' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain('Example Domain');
    expect(text).toContain('https://example.com');
  });

  it('page_snapshot returns formatted snapshot from ws client', async () => {
    mockWs.setHandler((method) => ({
      id: 'mock-id',
      type: 'response',
      method,
      payload: {
        text: '[page "Test"]\n  [button "Click"]',
        snapshotId: 'snap-123',
        url: 'https://example.com',
        title: 'Test Page',
      },
      timestamp: Date.now(),
    }));

    const result = await mcpClient.callTool({
      name: 'page_snapshot',
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain('Test Page');
    expect(text).toContain('snap-123');
  });

  it('tool returning error response sets isError', async () => {
    mockWs.setHandler((method) => ({
      id: 'mock-id',
      type: 'error',
      method,
      payload: { code: 'NO_TAB', message: 'No active tab' },
      timestamp: Date.now(),
    }));

    const result = await mcpClient.callTool({
      name: 'page_snapshot',
      arguments: {},
    });

    expect(result.isError).toBe(true);
  });
});
