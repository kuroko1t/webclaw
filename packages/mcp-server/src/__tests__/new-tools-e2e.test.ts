/**
 * E2E integration tests for v0.4.0 new tools.
 *
 * Uses MCP SDK Client + InMemoryTransport with a mocked WebSocketClient
 * that simulates the Chrome extension's responses for all 9 new tools
 * plus error handling scenarios.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createWebClawServer } from '../server.js';
import type { WebSocketClient } from '../ws-client.js';
import type { BridgeMessage, BridgeMethod } from 'webclaw-shared';

/** Create a mock WS client with configurable handler */
function createMockWsClient(): {
  wsClient: WebSocketClient;
  setHandler: (fn: (method: string, payload: unknown) => BridgeMessage) => void;
  getLastCall: () => { method: string; payload: unknown } | null;
} {
  let handler: ((method: string, payload: unknown) => BridgeMessage) | null = null;
  let lastCall: { method: string; payload: unknown } | null = null;

  const requestImpl = vi.fn(async (method: BridgeMethod, payload: unknown = {}) => {
    lastCall = { method, payload };
    if (handler) {
      return handler(method, payload);
    }
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
    getLastCall: () => lastCall,
  };
}

describe('v0.4.0 New Tools E2E (MCP Protocol)', () => {
  let mcpClient: Client;
  let mockWs: ReturnType<typeof createMockWsClient>;

  beforeAll(async () => {
    mockWs = createMockWsClient();
    const server = createWebClawServer({ wsClient: mockWs.wsClient });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    mcpClient = new Client({ name: 'e2e-test-client', version: '0.0.1' });
    await server.connect(serverTransport);
    await mcpClient.connect(clientTransport);
  });

  afterAll(async () => {
    await mcpClient.close();
  });

  // =========================================
  // Tool discovery
  // =========================================

  it('server reports version 0.4.0', () => {
    const info = mcpClient.getServerVersion();
    expect(info!.version).toBe('0.7.0');
  });

  it('lists exactly 19 tools', async () => {
    const { tools } = await mcpClient.listTools();
    expect(tools).toHaveLength(19);
  });

  it('new tools are present in tool list', async () => {
    const { tools } = await mcpClient.listTools();
    const names = tools.map((t) => t.name);
    const newTools = [
      'new_tab', 'list_tabs', 'switch_tab', 'close_tab',
      'go_back', 'go_forward', 'reload', 'wait_for_navigation', 'scroll_page',
    ];
    for (const name of newTools) {
      expect(names).toContain(name);
    }
  });

  it('hover tool is present in tool list', async () => {
    const { tools } = await mcpClient.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('hover');
  });

  // =========================================
  // Tab management tools
  // =========================================

  describe('new_tab', () => {
    it('opens a new tab with URL', async () => {
      mockWs.setHandler((method) => ({
        id: 'mock-id',
        type: 'response',
        method,
        payload: { tabId: 42, url: 'https://example.com', title: 'Example Domain' },
        timestamp: Date.now(),
      }));

      const result = await mcpClient.callTool({
        name: 'new_tab',
        arguments: { url: 'https://example.com' },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('42');
      expect(text).toContain('https://example.com');

      // Verify the bridge method was correct
      expect(mockWs.getLastCall()!.method).toBe('newTab');
      expect(mockWs.getLastCall()!.payload).toEqual({ url: 'https://example.com' });
    });

    it('opens a new tab without URL', async () => {
      mockWs.setHandler((method) => ({
        id: 'mock-id',
        type: 'response',
        method,
        payload: { tabId: 43, url: '', title: '' },
        timestamp: Date.now(),
      }));

      const result = await mcpClient.callTool({
        name: 'new_tab',
        arguments: {},
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('43');
    });

    it('rejects invalid URL', async () => {
      const result = await mcpClient.callTool({
        name: 'new_tab',
        arguments: { url: 'not-a-url' },
      });
      expect(result.isError).toBe(true);
    });
  });

  describe('list_tabs', () => {
    it('returns formatted tab list', async () => {
      mockWs.setHandler((method) => ({
        id: 'mock-id',
        type: 'response',
        method,
        payload: {
          tabs: [
            { tabId: 1, url: 'https://google.com', title: 'Google', active: true },
            { tabId: 2, url: 'https://github.com', title: 'GitHub', active: false },
            { tabId: 3, url: 'https://example.com', title: 'Example', active: false },
          ],
        },
        timestamp: Date.now(),
      }));

      const result = await mcpClient.callTool({
        name: 'list_tabs',
        arguments: {},
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('3 tabs');
      expect(text).toContain('[1] Google');
      expect(text).toContain('[2] GitHub');
      expect(text).toContain('[3] Example');
      // Active tab should have asterisk marker
      expect(text).toContain('* [1]');
      expect(mockWs.getLastCall()!.method).toBe('listTabs');
    });
  });

  describe('switch_tab', () => {
    it('switches to specified tab', async () => {
      mockWs.setHandler((method) => ({
        id: 'mock-id',
        type: 'response',
        method,
        payload: { tabId: 2, url: 'https://github.com', title: 'GitHub' },
        timestamp: Date.now(),
      }));

      const result = await mcpClient.callTool({
        name: 'switch_tab',
        arguments: { tabId: 2 },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('Switched to tab 2');
      expect(text).toContain('GitHub');
      expect(mockWs.getLastCall()!.method).toBe('switchTab');
      expect(mockWs.getLastCall()!.payload).toEqual({ tabId: 2 });
    });

    it('requires tabId parameter', async () => {
      const result = await mcpClient.callTool({
        name: 'switch_tab',
        arguments: {},
      });
      expect(result.isError).toBe(true);
    });
  });

  describe('close_tab', () => {
    it('closes specified tab', async () => {
      mockWs.setHandler((method) => ({
        id: 'mock-id',
        type: 'response',
        method,
        payload: { closed: true, tabId: 5 },
        timestamp: Date.now(),
      }));

      const result = await mcpClient.callTool({
        name: 'close_tab',
        arguments: { tabId: 5 },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('Closed tab 5');
      expect(mockWs.getLastCall()!.method).toBe('closeTab');
    });

    it('handles TAB_NOT_FOUND error with recovery suggestion', async () => {
      mockWs.setHandler((method) => ({
        id: 'mock-id',
        type: 'error',
        method,
        payload: { code: 'TAB_NOT_FOUND', message: 'Tab 999 not found' },
        timestamp: Date.now(),
      }));

      const result = await mcpClient.callTool({
        name: 'close_tab',
        arguments: { tabId: 999 },
      });

      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('Tab 999 not found');
      expect(text).toContain('Hint:');
      expect(text).toContain('list_tabs');
    });

    it('requires tabId parameter', async () => {
      const result = await mcpClient.callTool({
        name: 'close_tab',
        arguments: {},
      });
      expect(result.isError).toBe(true);
    });
  });

  // =========================================
  // Navigation tools
  // =========================================

  describe('go_back', () => {
    it('navigates back in history', async () => {
      mockWs.setHandler((method) => ({
        id: 'mock-id',
        type: 'response',
        method,
        payload: { url: 'https://prev-page.com', title: 'Previous Page', tabId: 1 },
        timestamp: Date.now(),
      }));

      const result = await mcpClient.callTool({
        name: 'go_back',
        arguments: {},
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('Went back to');
      expect(text).toContain('Previous Page');
      expect(text).toContain('https://prev-page.com');
      expect(mockWs.getLastCall()!.method).toBe('goBack');
    });

    it('accepts optional tabId', async () => {
      mockWs.setHandler((method) => ({
        id: 'mock-id',
        type: 'response',
        method,
        payload: { url: 'https://prev.com', title: 'Prev', tabId: 3 },
        timestamp: Date.now(),
      }));

      const result = await mcpClient.callTool({
        name: 'go_back',
        arguments: { tabId: 3 },
      });

      expect(result.isError).toBeFalsy();
      expect(mockWs.getLastCall()!.payload).toEqual({ tabId: 3 });
    });
  });

  describe('go_forward', () => {
    it('navigates forward in history', async () => {
      mockWs.setHandler((method) => ({
        id: 'mock-id',
        type: 'response',
        method,
        payload: { url: 'https://next-page.com', title: 'Next Page', tabId: 1 },
        timestamp: Date.now(),
      }));

      const result = await mcpClient.callTool({
        name: 'go_forward',
        arguments: {},
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('Went forward to');
      expect(text).toContain('Next Page');
      expect(mockWs.getLastCall()!.method).toBe('goForward');
    });
  });

  describe('reload', () => {
    it('reloads the page', async () => {
      mockWs.setHandler((method) => ({
        id: 'mock-id',
        type: 'response',
        method,
        payload: { url: 'https://example.com', title: 'Example', tabId: 1 },
        timestamp: Date.now(),
      }));

      const result = await mcpClient.callTool({
        name: 'reload',
        arguments: {},
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('Reloaded');
      expect(text).toContain('Example');
      expect(mockWs.getLastCall()!.method).toBe('reload');
    });

    it('supports bypassCache option', async () => {
      mockWs.setHandler((method) => ({
        id: 'mock-id',
        type: 'response',
        method,
        payload: { url: 'https://example.com', title: 'Example', tabId: 1 },
        timestamp: Date.now(),
      }));

      await mcpClient.callTool({
        name: 'reload',
        arguments: { bypassCache: true },
      });

      expect(mockWs.getLastCall()!.payload).toEqual({ bypassCache: true });
    });

    it('supports tabId option', async () => {
      mockWs.setHandler((method) => ({
        id: 'mock-id',
        type: 'response',
        method,
        payload: { url: 'https://example.com', title: 'Example', tabId: 5 },
        timestamp: Date.now(),
      }));

      await mcpClient.callTool({
        name: 'reload',
        arguments: { tabId: 5, bypassCache: false },
      });

      expect(mockWs.getLastCall()!.payload).toEqual({ tabId: 5, bypassCache: false });
    });
  });

  describe('wait_for_navigation', () => {
    it('waits for page load', async () => {
      mockWs.setHandler((method) => ({
        id: 'mock-id',
        type: 'response',
        method,
        payload: { url: 'https://loaded.com', title: 'Loaded Page', tabId: 1 },
        timestamp: Date.now(),
      }));

      const result = await mcpClient.callTool({
        name: 'wait_for_navigation',
        arguments: {},
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('Page loaded');
      expect(text).toContain('Loaded Page');
      expect(mockWs.getLastCall()!.method).toBe('waitForNavigation');
    });

    it('supports custom timeout', async () => {
      mockWs.setHandler((method) => ({
        id: 'mock-id',
        type: 'response',
        method,
        payload: { url: 'https://slow.com', title: 'Slow Page', tabId: 1 },
        timestamp: Date.now(),
      }));

      await mcpClient.callTool({
        name: 'wait_for_navigation',
        arguments: { timeoutMs: 10000 },
      });

      expect(mockWs.getLastCall()!.payload).toEqual({ timeoutMs: 10000 });
    });

    it('handles NAVIGATION_TIMEOUT error with recovery hint', async () => {
      mockWs.setHandler((method) => ({
        id: 'mock-id',
        type: 'error',
        method,
        payload: { code: 'NAVIGATION_TIMEOUT', message: 'Navigation timed out' },
        timestamp: Date.now(),
      }));

      const result = await mcpClient.callTool({
        name: 'wait_for_navigation',
        arguments: {},
      });

      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('Navigation timed out');
      expect(text).toContain('Hint:');
    });
  });

  // =========================================
  // Scroll tool
  // =========================================

  describe('scroll_page', () => {
    it('scrolls down by default', async () => {
      mockWs.setHandler((method) => ({
        id: 'mock-id',
        type: 'response',
        method,
        payload: { success: true, scrolledBy: 800 },
        timestamp: Date.now(),
      }));

      const result = await mcpClient.callTool({
        name: 'scroll_page',
        arguments: {},
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('Scrolled down');
      expect(mockWs.getLastCall()!.method).toBe('scrollPage');
    });

    it('scrolls up with specified amount', async () => {
      mockWs.setHandler((method) => ({
        id: 'mock-id',
        type: 'response',
        method,
        payload: { success: true, scrolledBy: -500 },
        timestamp: Date.now(),
      }));

      const result = await mcpClient.callTool({
        name: 'scroll_page',
        arguments: { direction: 'up', amount: 500 },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('Scrolled up');
      expect(mockWs.getLastCall()!.payload).toEqual({
        direction: 'up',
        amount: 500,
      });
    });

    it('scrolls to a specific element by ref', async () => {
      mockWs.setHandler((method) => ({
        id: 'mock-id',
        type: 'response',
        method,
        payload: { success: true, ref: '@e5' },
        timestamp: Date.now(),
      }));

      const result = await mcpClient.callTool({
        name: 'scroll_page',
        arguments: { ref: '@e5', snapshotId: 'snap-123' },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('Scrolled to element @e5');
      expect(mockWs.getLastCall()!.payload).toEqual({
        ref: '@e5',
        snapshotId: 'snap-123',
      });
    });

    it('rejects invalid ref pattern', async () => {
      const result = await mcpClient.callTool({
        name: 'scroll_page',
        arguments: { ref: 'bad-ref' },
      });
      expect(result.isError).toBe(true);
    });

    it('rejects invalid direction', async () => {
      const result = await mcpClient.callTool({
        name: 'scroll_page',
        arguments: { direction: 'left' },
      });
      expect(result.isError).toBe(true);
    });
  });

  // =========================================
  // Hover tool
  // =========================================

  describe('hover', () => {
    it('hovers over an element by ref', async () => {
      mockWs.setHandler((method) => ({
        id: 'mock-id',
        type: 'response',
        method,
        payload: { success: true },
        timestamp: Date.now(),
      }));

      const result = await mcpClient.callTool({
        name: 'hover',
        arguments: { ref: '@e3', snapshotId: 'snap-789' },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('Hovered over @e3');
      expect(text).toContain('page_snapshot');
      expect(mockWs.getLastCall()!.method).toBe('hover');
      expect(mockWs.getLastCall()!.payload).toEqual({ ref: '@e3', snapshotId: 'snap-789' });
    });

    it('supports optional tabId', async () => {
      mockWs.setHandler((method) => ({
        id: 'mock-id',
        type: 'response',
        method,
        payload: { success: true },
        timestamp: Date.now(),
      }));

      await mcpClient.callTool({
        name: 'hover',
        arguments: { ref: '@e1', snapshotId: 'snap-abc', tabId: 5 },
      });

      expect(mockWs.getLastCall()!.payload).toEqual({ ref: '@e1', snapshotId: 'snap-abc', tabId: 5 });
    });

    it('rejects invalid ref pattern', async () => {
      const result = await mcpClient.callTool({
        name: 'hover',
        arguments: { ref: 'bad-ref', snapshotId: 'snap-123' },
      });
      expect(result.isError).toBe(true);
    });

    it('requires snapshotId', async () => {
      const result = await mcpClient.callTool({
        name: 'hover',
        arguments: { ref: '@e1' },
      });
      expect(result.isError).toBe(true);
    });

    it('handles error response', async () => {
      mockWs.setHandler((method) => ({
        id: 'mock-id',
        type: 'error',
        method,
        payload: { code: 'STALE_SNAPSHOT', message: 'Stale snapshot ID' },
        timestamp: Date.now(),
      }));

      const result = await mcpClient.callTool({
        name: 'hover',
        arguments: { ref: '@e1', snapshotId: 'old-snap' },
      });

      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('Stale snapshot');
    });
  });

  // =========================================
  // Error handling
  // =========================================

  describe('error handling with recovery suggestions', () => {
    it('CONNECTION_LOST includes reconnection hint', async () => {
      mockWs.setHandler((method) => ({
        id: 'mock-id',
        type: 'error',
        method,
        payload: { code: 'CONNECTION_LOST', message: 'Extension disconnected' },
        timestamp: Date.now(),
      }));

      const result = await mcpClient.callTool({
        name: 'list_tabs',
        arguments: {},
      });

      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('Extension disconnected');
      expect(text).toContain('Hint:');
      expect(text).toContain('reconnect');
    });

    it('STALE_SNAPSHOT includes snapshot hint', async () => {
      mockWs.setHandler((method) => ({
        id: 'mock-id',
        type: 'error',
        method,
        payload: { code: 'STALE_SNAPSHOT', message: 'Stale snapshot ID' },
        timestamp: Date.now(),
      }));

      const result = await mcpClient.callTool({
        name: 'click',
        arguments: { ref: '@e1', snapshotId: 'old-snap' },
      });

      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('Stale snapshot');
      expect(text).toContain('page_snapshot');
    });

    it('NO_ACTIVE_TAB includes new_tab hint', async () => {
      mockWs.setHandler((method) => ({
        id: 'mock-id',
        type: 'error',
        method,
        payload: { code: 'NO_ACTIVE_TAB', message: 'No active tab' },
        timestamp: Date.now(),
      }));

      const result = await mcpClient.callTool({
        name: 'go_back',
        arguments: {},
      });

      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('No active tab');
      expect(text).toContain('new_tab');
    });

    it('unknown error code has no hint', async () => {
      mockWs.setHandler((method) => ({
        id: 'mock-id',
        type: 'error',
        method,
        payload: { code: 'SOME_UNKNOWN_CODE', message: 'Something went wrong' },
        timestamp: Date.now(),
      }));

      const result = await mcpClient.callTool({
        name: 'reload',
        arguments: {},
      });

      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('Something went wrong');
      expect(text).not.toContain('Hint:');
    });
  });

  // =========================================
  // Schema validation for new tools
  // =========================================

  describe('schema validation', () => {
    it('new_tab has optional url in schema', async () => {
      const { tools } = await mcpClient.listTools();
      const tool = tools.find((t) => t.name === 'new_tab')!;
      expect(tool.inputSchema.properties).toHaveProperty('url');
      expect(tool.inputSchema.required ?? []).not.toContain('url');
    });

    it('list_tabs has no required params', async () => {
      const { tools } = await mcpClient.listTools();
      const tool = tools.find((t) => t.name === 'list_tabs')!;
      expect(tool.inputSchema.required ?? []).toEqual([]);
    });

    it('switch_tab requires tabId', async () => {
      const { tools } = await mcpClient.listTools();
      const tool = tools.find((t) => t.name === 'switch_tab')!;
      expect(tool.inputSchema.required).toContain('tabId');
    });

    it('close_tab requires tabId', async () => {
      const { tools } = await mcpClient.listTools();
      const tool = tools.find((t) => t.name === 'close_tab')!;
      expect(tool.inputSchema.required).toContain('tabId');
    });

    it('go_back has optional tabId', async () => {
      const { tools } = await mcpClient.listTools();
      const tool = tools.find((t) => t.name === 'go_back')!;
      expect(tool.inputSchema.properties).toHaveProperty('tabId');
      expect(tool.inputSchema.required ?? []).not.toContain('tabId');
    });

    it('go_forward has optional tabId', async () => {
      const { tools } = await mcpClient.listTools();
      const tool = tools.find((t) => t.name === 'go_forward')!;
      expect(tool.inputSchema.properties).toHaveProperty('tabId');
      expect(tool.inputSchema.required ?? []).not.toContain('tabId');
    });

    it('reload has optional tabId and bypassCache', async () => {
      const { tools } = await mcpClient.listTools();
      const tool = tools.find((t) => t.name === 'reload')!;
      expect(tool.inputSchema.properties).toHaveProperty('tabId');
      expect(tool.inputSchema.properties).toHaveProperty('bypassCache');
      expect(tool.inputSchema.required ?? []).toEqual([]);
    });

    it('wait_for_navigation has optional params', async () => {
      const { tools } = await mcpClient.listTools();
      const tool = tools.find((t) => t.name === 'wait_for_navigation')!;
      expect(tool.inputSchema.properties).toHaveProperty('tabId');
      expect(tool.inputSchema.properties).toHaveProperty('timeoutMs');
      expect(tool.inputSchema.required ?? []).toEqual([]);
    });

    it('scroll_page has optional direction, amount, ref, snapshotId', async () => {
      const { tools } = await mcpClient.listTools();
      const tool = tools.find((t) => t.name === 'scroll_page')!;
      expect(tool.inputSchema.properties).toHaveProperty('direction');
      expect(tool.inputSchema.properties).toHaveProperty('amount');
      expect(tool.inputSchema.properties).toHaveProperty('ref');
      expect(tool.inputSchema.properties).toHaveProperty('snapshotId');
      expect(tool.inputSchema.required ?? []).toEqual([]);
    });
  });

  // =========================================
  // Existing tools still work (regression)
  // =========================================

  describe('regression: existing tools', () => {
    it('navigate_to still works with requestWithRetry', async () => {
      mockWs.setHandler((method) => ({
        id: 'mock-id',
        type: 'response',
        method,
        payload: { url: 'https://example.com', title: 'Example', tabId: 1 },
        timestamp: Date.now(),
      }));

      const result = await mcpClient.callTool({
        name: 'navigate_to',
        arguments: { url: 'https://example.com' },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('Example');
    });

    it('page_snapshot still works', async () => {
      mockWs.setHandler((method) => ({
        id: 'mock-id',
        type: 'response',
        method,
        payload: {
          text: '[page "Test"]\n  @e1 [button "Click"]',
          snapshotId: 'snap-456',
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
      expect(text).toContain('snap-456');
      expect(text).toContain('@e1');
    });

    it('click still works', async () => {
      mockWs.setHandler((method) => ({
        id: 'mock-id',
        type: 'response',
        method,
        payload: { success: true },
        timestamp: Date.now(),
      }));

      const result = await mcpClient.callTool({
        name: 'click',
        arguments: { ref: '@e1', snapshotId: 'snap-456' },
      });

      expect(result.isError).toBeFalsy();
    });

    it('screenshot still returns image content', async () => {
      mockWs.setHandler((method) => ({
        id: 'mock-id',
        type: 'response',
        method,
        payload: { dataUrl: 'data:image/png;base64,iVBORw0KGgo=', tabId: 1 },
        timestamp: Date.now(),
      }));

      const result = await mcpClient.callTool({
        name: 'screenshot',
        arguments: {},
      });

      expect(result.isError).toBeFalsy();
      const content = result.content as Array<{ type: string; data?: string; mimeType?: string }>;
      expect(content[0].type).toBe('image');
      expect(content[0].mimeType).toBe('image/png');
      expect(content[0].data).toBe('iVBORw0KGgo=');
    });
  });
});
