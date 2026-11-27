/**
 * type_text pressKeys option: schema, forwarding to the extension and the
 * request timeout that grows with the number of key presses.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createWebClawServer } from '../server.js';
import type { WebSocketClient } from '../ws-client.js';
import type { BridgeMethod } from 'webclaw-shared';
import { OPERATION_TIMEOUTS, typeTextTimeoutMs } from 'webclaw-shared';

const requestWithRetry = vi.fn(async (method: BridgeMethod, _payload: unknown = {}, _timeoutMs?: number) => ({
  id: 'mock-id',
  type: 'response' as const,
  method,
  payload: method === 'newTab' ? { tabId: 7 } : { success: true },
  timestamp: Date.now(),
}));

describe('type_text pressKeys', () => {
  let mcpClient: Client;

  beforeAll(async () => {
    const wsClient = {
      request: requestWithRetry,
      requestWithRetry,
      isConnected: vi.fn(() => true),
      close: vi.fn(async () => {}),
    } as unknown as WebSocketClient;
    const server = createWebClawServer({ wsClient });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    mcpClient = new Client({ name: 'test-client', version: '0.0.1' });
    await server.connect(serverTransport);
    await mcpClient.connect(clientTransport);
  });

  afterAll(async () => {
    await mcpClient.close();
  });

  beforeEach(() => {
    requestWithRetry.mockClear();
  });

  function typeTextCall() {
    const call = requestWithRetry.mock.calls.find(([m]) => m === 'typeText');
    expect(call).toBeDefined();
    return call!;
  }

  it('exposes an optional boolean pressKeys parameter', async () => {
    const { tools } = await mcpClient.listTools();
    const tt = tools.find((t) => t.name === 'type_text')!;
    const props = tt.inputSchema.properties as Record<string, { type?: string; description?: string }>;
    expect(props.pressKeys.type).toBe('boolean');
    expect(props.pressKeys.description).toMatch(/Enter/);
    expect(tt.inputSchema.required).not.toContain('pressKeys');
    expect(tt.description).toMatch(/pressKeys/);
  });

  it('forwards pressKeys and extends the timeout by the number of keys', async () => {
    const text = 'a\nb\nc,d';
    await mcpClient.callTool({
      name: 'type_text',
      arguments: { ref: '@e1', text, snapshotId: 'snap-1', pressKeys: true },
    });
    const [, payload, timeoutMs] = typeTextCall();
    expect(payload).toMatchObject({ ref: '@e1', text, pressKeys: true });
    expect(timeoutMs).toBe(typeTextTimeoutMs(text, true));
    expect(timeoutMs).toBeGreaterThan(OPERATION_TIMEOUTS.typeText);
  });

  it('uses the default timeout and no pressKeys when the option is omitted', async () => {
    await mcpClient.callTool({
      name: 'type_text',
      arguments: { ref: '@e1', text: 'a\nb', snapshotId: 'snap-1' },
    });
    const call = typeTextCall();
    expect((call[1] as Record<string, unknown>).pressKeys).toBeUndefined();
    expect(call.length).toBe(2);
  });

  it('scales the timeout so long texts with many keys fit', () => {
    const text = 'line\n'.repeat(200);
    const timeout = typeTextTimeoutMs(text, true);
    // 200 keys * (2 CDP round trips + 50ms delay) must fit comfortably
    expect(timeout).toBeGreaterThanOrEqual(OPERATION_TIMEOUTS.typeText + 200 * 200);
    expect(typeTextTimeoutMs(text, false)).toBe(OPERATION_TIMEOUTS.typeText);
  });
});
