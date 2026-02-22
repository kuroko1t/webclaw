/**
 * Tests for session tab auto-assignment.
 *
 * Verifies that each MCP server instance auto-creates a dedicated browser tab
 * on the first tool call, reuses it on subsequent calls, respects explicit
 * tabId overrides, and recovers when the session tab is closed externally.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createWebClawServer } from '../server.js';
import type { WebSocketClient } from '../ws-client.js';
import type { BridgeMessage, BridgeMethod } from 'webclaw-shared';

/** Create a method-aware mock WS client that tracks all calls */
function createMock() {
  const calls: Array<{ method: string; payload: unknown }> = [];
  let newTabCounter = 100;

  const requestImpl = vi.fn(
    async (method: BridgeMethod, payload: unknown = {}): Promise<BridgeMessage> => {
      calls.push({ method, payload });

      if (method === 'newTab') {
        const tabId = newTabCounter++;
        return {
          id: 'mock-id',
          type: 'response',
          method,
          payload: { tabId, url: '', title: '' },
          timestamp: Date.now(),
        };
      }

      // Default success response
      return {
        id: 'mock-id',
        type: 'response',
        method,
        payload: {
          url: 'https://example.com',
          title: 'Example',
          tabId: 1,
          text: 'snapshot',
          snapshotId: 'snap-1',
        },
        timestamp: Date.now(),
      };
    }
  );

  const wsClient = {
    request: requestImpl,
    requestWithRetry: requestImpl,
    isConnected: vi.fn(() => true),
    close: vi.fn(async () => {}),
  } as unknown as WebSocketClient;

  return { wsClient, calls, requestImpl };
}

describe('Session tab auto-assignment', () => {
  let mcpClient: Client;
  let mock: ReturnType<typeof createMock>;

  beforeEach(async () => {
    mock = createMock();
    const server = createWebClawServer({ wsClient: mock.wsClient });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    mcpClient = new Client({ name: 'session-tab-test', version: '0.0.1' });
    await server.connect(serverTransport);
    await mcpClient.connect(clientTransport);
  });

  afterEach(async () => {
    await mcpClient.close();
  });

  it('auto-creates session tab on first tool call', async () => {
    await mcpClient.callTool({
      name: 'page_snapshot',
      arguments: {},
    });

    // Should have called newTab first, then snapshot
    expect(mock.calls).toHaveLength(2);
    expect(mock.calls[0].method).toBe('newTab');
    expect(mock.calls[1].method).toBe('snapshot');
    expect(mock.calls[1].payload).toMatchObject({ tabId: 100 });
  });

  it('reuses session tab on subsequent calls', async () => {
    // First call creates the session tab
    await mcpClient.callTool({
      name: 'page_snapshot',
      arguments: {},
    });

    mock.calls.length = 0;

    // Second call should reuse the existing session tab
    await mcpClient.callTool({
      name: 'go_back',
      arguments: {},
    });

    // Only one call (goBack), no newTab
    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0].method).toBe('goBack');
    expect(mock.calls[0].payload).toMatchObject({ tabId: 100 });
  });

  it('uses explicit tabId when provided', async () => {
    await mcpClient.callTool({
      name: 'go_back',
      arguments: { tabId: 42 },
    });

    // Should NOT create a new tab
    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0].method).toBe('goBack');
    expect(mock.calls[0].payload).toMatchObject({ tabId: 42 });
  });

  it('recovers when session tab is closed', async () => {
    // First call creates session tab 100
    await mcpClient.callTool({
      name: 'page_snapshot',
      arguments: {},
    });

    mock.calls.length = 0;

    // Simulate TAB_NOT_FOUND for the old session tab,
    // and success for the new one
    mock.requestImpl.mockImplementation(
      async (method: BridgeMethod, payload: unknown = {}): Promise<BridgeMessage> => {
        mock.calls.push({ method, payload });

        if (method === 'newTab') {
          return {
            id: 'mock-id',
            type: 'response',
            method,
            payload: { tabId: 200, url: '', title: '' },
            timestamp: Date.now(),
          };
        }

        // Return TAB_NOT_FOUND only when targeting the old session tab (100)
        const p = payload as { tabId?: number };
        if (p.tabId === 100) {
          return {
            id: 'mock-id',
            type: 'error',
            method,
            payload: { code: 'TAB_NOT_FOUND', message: 'Tab 100 not found' },
            timestamp: Date.now(),
          };
        }

        return {
          id: 'mock-id',
          type: 'response',
          method,
          payload: { url: 'https://example.com', title: 'Example', tabId: p.tabId },
          timestamp: Date.now(),
        };
      }
    );

    const result = await mcpClient.callTool({
      name: 'go_back',
      arguments: {},
    });

    // Should have: goBack(100) → TAB_NOT_FOUND → newTab → goBack(200)
    expect(result.isError).toBeFalsy();
    const methods = mock.calls.map((c) => c.method);
    expect(methods).toEqual(['goBack', 'newTab', 'goBack']);
    expect(mock.calls[2].payload).toMatchObject({ tabId: 200 });
  });
});
