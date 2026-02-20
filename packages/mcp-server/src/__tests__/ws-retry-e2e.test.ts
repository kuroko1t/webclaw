/**
 * Real WebSocket E2E tests for requestWithRetry and error handling.
 *
 * Spawns a real WebSocketClient and connects a fake extension to test:
 * - requestWithRetry succeeds on first try
 * - requestWithRetry retries on transient errors (connection lost)
 * - requestWithRetry does NOT retry on non-transient errors
 * - Disconnect rejects all pending requests with CONNECTION_LOST
 * - Operation-specific timeouts are used
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocket } from 'ws';
import { WebSocketClient } from '../ws-client.js';

// Mock chrome-launcher to prevent actual Chrome launch
vi.mock('../chrome-launcher.js', () => ({
  launchChrome: vi.fn(async () => false),
}));

let wsClient: WebSocketClient;
let fakeExt: WebSocket | null = null;
let port: number;
let nextPort = 19400;

function connectFakeExtension(): Promise<WebSocket> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on('open', () => {
      fakeExt = ws;
      setTimeout(() => resolve(ws), 100);
    });
  });
}

beforeEach(async () => {
  port = nextPort++;
  wsClient = await WebSocketClient.create(port);
});

afterEach(async () => {
  if (fakeExt && fakeExt.readyState === WebSocket.OPEN) {
    fakeExt.close();
  }
  fakeExt = null;
  await wsClient.close();
});

describe('requestWithRetry - real WebSocket E2E', () => {
  it('succeeds on first attempt for all new bridge methods', async () => {
    const ws = await connectFakeExtension();

    // Auto-respond to any request
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'request') {
        ws.send(JSON.stringify({
          id: msg.id,
          type: 'response',
          method: msg.method,
          payload: { ok: true, method: msg.method },
          timestamp: Date.now(),
        }));
      }
    });

    // Test each new method
    const newMethods = [
      'newTab', 'listTabs', 'switchTab', 'closeTab',
      'goBack', 'goForward', 'reload', 'waitForNavigation', 'scrollPage',
    ] as const;

    for (const method of newMethods) {
      const result = await wsClient.requestWithRetry(method, { test: true });
      expect(result.type).toBe('response');
      expect((result.payload as any).method).toBe(method);
    }
  });

  it('retries on connection lost and succeeds on reconnection', async () => {
    const ws = await connectFakeExtension();

    let requestCount = 0;

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      requestCount++;
      // First request: don't respond, just close connection
      if (requestCount === 1) {
        ws.close();
        // Reconnect after 200ms
        setTimeout(async () => {
          const ws2 = await connectFakeExtension();
          ws2.on('message', (data2) => {
            const msg2 = JSON.parse(data2.toString());
            ws2.send(JSON.stringify({
              id: msg2.id,
              type: 'response',
              method: msg2.method,
              payload: { reconnected: true },
              timestamp: Date.now(),
            }));
          });
        }, 200);
      }
    });

    // requestWithRetry should handle the disconnect, wait, and retry
    const result = await wsClient.requestWithRetry('ping', {});
    expect(result.type).toBe('response');
    expect((result.payload as any).reconnected).toBe(true);
  }, 15000);

  it('disconnect rejects ALL pending requests simultaneously', async () => {
    const ws = await connectFakeExtension();
    // Don't respond to any requests

    // Send 3 requests simultaneously
    const p1 = wsClient.request('ping', {}, 10_000);
    const p2 = wsClient.request('snapshot', {}, 10_000);
    const p3 = wsClient.request('listTabs', {}, 10_000);

    // Wait for requests to be sent
    await new Promise((r) => setTimeout(r, 100));

    // Disconnect
    ws.close();

    // All should reject with CONNECTION_LOST
    const results = await Promise.allSettled([p1, p2, p3]);
    for (const r of results) {
      expect(r.status).toBe('rejected');
      if (r.status === 'rejected') {
        expect(r.reason.message).toContain('CONNECTION_LOST');
      }
    }
  });

  it('error responses (not exceptions) are returned without retry', async () => {
    const ws = await connectFakeExtension();

    let callCount = 0;
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      callCount++;
      // Return an error response (not a thrown exception)
      ws.send(JSON.stringify({
        id: msg.id,
        type: 'error',
        method: msg.method,
        payload: { code: 'STALE_SNAPSHOT', message: 'Snapshot is stale' },
        timestamp: Date.now(),
      }));
    });

    const result = await wsClient.requestWithRetry('click', { ref: '@e1' });
    // Error responses are returned (not thrown), so no retry
    expect(result.type).toBe('error');
    expect(callCount).toBe(1); // Only called once, no retry
  });
});

describe('operation-specific timeouts', () => {
  it('listTabs uses 5s timeout (shorter than default)', async () => {
    const ws = await connectFakeExtension();
    // Don't respond — let it timeout

    const start = Date.now();
    try {
      await wsClient.requestWithRetry('listTabs', {});
      expect.fail('Should have timed out');
    } catch (err: any) {
      const elapsed = Date.now() - start;
      expect(err.message).toContain('timed out');
      // Should timeout around 5s (with some tolerance for retries)
      // With 2 retries: 5s + 0.5s + 5s + 1s + 5s = ~16.5s max
      // But first timeout should trigger retry quickly
      expect(elapsed).toBeLessThan(20_000);
    }
  }, 25000);
});
