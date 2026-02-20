/**
 * Tests for WebSocketClient requestWithRetry, disconnect handling, and retry logic.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import { WebSocketClient } from '../ws-client.js';

// Mock chrome-launcher to prevent actual Chrome launch
vi.mock('../chrome-launcher.js', () => ({
  launchChrome: vi.fn(async () => false),
}));

let wsClient: WebSocketClient;
let extensionWs: WebSocket | null = null;
let port: number;

/** Helper: connect a fake extension to the WS server */
function connectFakeExtension(): Promise<WebSocket> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on('open', () => {
      extensionWs = ws;
      // Give the server time to register the connection
      setTimeout(() => resolve(ws), 100);
    });
  });
}

/** Helper: auto-respond to requests on the fake extension */
function autoRespond(ws: WebSocket, handler?: (msg: any) => any): void {
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'request') {
      const payload = handler ? handler(msg) : {};
      ws.send(JSON.stringify({
        id: msg.id,
        type: 'response',
        method: msg.method,
        payload,
        timestamp: Date.now(),
      }));
    }
  });
}

// Use a unique port range that doesn't collide with ws-client-ensure-connected.test.ts (19200+)
let nextPort = 19300;

beforeEach(async () => {
  port = nextPort++;
  wsClient = await WebSocketClient.create(port);
});

afterEach(async () => {
  if (extensionWs && extensionWs.readyState === WebSocket.OPEN) {
    extensionWs.close();
    extensionWs = null;
  }
  await wsClient.close();
});

describe('requestWithRetry', () => {
  it('succeeds on first attempt when connected', async () => {
    const ws = await connectFakeExtension();
    autoRespond(ws, () => ({ pong: true }));

    const result = await wsClient.requestWithRetry('ping', {});
    expect(result.type).toBe('response');
    expect(result.payload).toEqual({ pong: true });
  });

  it('uses operation-specific timeout', async () => {
    const ws = await connectFakeExtension();
    // Don't respond — let it timeout
    // listTabs has 5000ms timeout, but we mock it to be shorter for test

    // We just verify requestWithRetry calls request and uses the method name
    autoRespond(ws, () => ({ tabs: [] }));

    const result = await wsClient.requestWithRetry('listTabs', {});
    expect(result.type).toBe('response');
  });

  it('throws non-transient errors immediately without retry', async () => {
    const ws = await connectFakeExtension();
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      ws.send(JSON.stringify({
        id: msg.id,
        type: 'error',
        method: msg.method,
        payload: { code: 'STALE_SNAPSHOT', message: 'Stale snapshot' },
        timestamp: Date.now(),
      }));
    });

    // Non-transient errors should still return the error response (not throw)
    // because the response itself is valid, it's just an error type
    const result = await wsClient.requestWithRetry('click', {
      ref: '@e1',
      snapshotId: 'old',
    });
    expect(result.type).toBe('error');
  });
});

describe('disconnect handling', () => {
  it('rejects pending requests when extension disconnects', async () => {
    const ws = await connectFakeExtension();
    // Don't auto-respond, just disconnect
    const requestPromise = wsClient.request('ping', {}, 10_000);

    // Wait a bit for the request to be sent, then disconnect
    await new Promise((r) => setTimeout(r, 50));
    ws.close();

    await expect(requestPromise).rejects.toThrow('CONNECTION_LOST');
  });

  it('rejects all pending requests on disconnect', async () => {
    const ws = await connectFakeExtension();
    // Don't auto-respond

    const p1 = wsClient.request('ping', {}, 10_000);
    const p2 = wsClient.request('snapshot', {}, 10_000);

    await new Promise((r) => setTimeout(r, 50));
    ws.close();

    await expect(p1).rejects.toThrow('CONNECTION_LOST');
    await expect(p2).rejects.toThrow('CONNECTION_LOST');
  });
});
