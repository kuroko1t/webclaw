/**
 * Tests for WebSocket Origin / Host header validation.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { WebSocket } from 'ws';
import { WebSocketClient } from '../ws-client.js';
import http from 'http';

// Mock chrome-launcher to prevent actual Chrome launch
vi.mock('../chrome-launcher.js', () => ({
  launchChrome: vi.fn(async () => false),
}));

let wsClient: WebSocketClient;

afterEach(async () => {
  if (wsClient) {
    await wsClient.close();
  }
});

/**
 * Attempt a WebSocket connection with custom headers.
 * Returns 'open' on success or the HTTP status code on rejection.
 */
function connectWithHeaders(
  port: number,
  headers: Record<string, string>
): Promise<'open' | number> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers });

    ws.on('open', () => {
      ws.close();
      resolve('open');
    });

    ws.on('unexpected-response', (_req: unknown, res: http.IncomingMessage) => {
      resolve(res.statusCode ?? 0);
    });

    ws.on('error', () => {
      // unexpected-response fires first for 403; this is a fallback
    });
  });
}

describe('WebSocket Origin / Host validation', () => {
  async function setup(): Promise<number> {
    wsClient = await WebSocketClient.create(0);
    const addr = (wsClient as any).wss.address();
    return addr.port as number;
  }

  // --- Origin tests ---

  it('allows connections with no Origin header (Node.js clients)', async () => {
    const port = await setup();
    const result = await connectWithHeaders(port, {});
    expect(result).toBe('open');
  });

  it('allows chrome-extension:// origin', async () => {
    const port = await setup();
    const result = await connectWithHeaders(port, {
      Origin: 'chrome-extension://abcdefghijklmnop',
    });
    expect(result).toBe('open');
  });

  it('allows moz-extension:// origin', async () => {
    const port = await setup();
    const result = await connectWithHeaders(port, {
      Origin: 'moz-extension://abcdefghijklmnop',
    });
    expect(result).toBe('open');
  });

  it('allows safari-web-extension:// origin', async () => {
    const port = await setup();
    const result = await connectWithHeaders(port, {
      Origin: 'safari-web-extension://abcdefghijklmnop',
    });
    expect(result).toBe('open');
  });

  it('rejects https://evil.com origin with 403', async () => {
    const port = await setup();
    const result = await connectWithHeaders(port, {
      Origin: 'https://evil.com',
    });
    expect(result).toBe(403);
  });

  it('rejects http://localhost:3000 origin with 403', async () => {
    const port = await setup();
    const result = await connectWithHeaders(port, {
      Origin: 'http://localhost:3000',
    });
    expect(result).toBe(403);
  });

  // --- Host tests ---

  it('allows Host: 127.0.0.1:<port>', async () => {
    const port = await setup();
    const result = await connectWithHeaders(port, {
      Host: `127.0.0.1:${port}`,
    });
    expect(result).toBe('open');
  });

  it('allows Host: localhost:<port>', async () => {
    const port = await setup();
    const result = await connectWithHeaders(port, {
      Host: `localhost:${port}`,
    });
    expect(result).toBe('open');
  });

  it('allows Host: [::1]:<port>', async () => {
    const port = await setup();
    const result = await connectWithHeaders(port, {
      Host: `[::1]:${port}`,
    });
    expect(result).toBe('open');
  });

  it('rejects Host: evil.com:<port> with 403', async () => {
    const port = await setup();
    const result = await connectWithHeaders(port, {
      Host: `evil.com:${port}`,
    });
    expect(result).toBe(403);
  });
});
