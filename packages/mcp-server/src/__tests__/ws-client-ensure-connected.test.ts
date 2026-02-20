/**
 * Tests for WebSocketClient.ensureConnected() and auto-launch behavior.
 *
 * Uses a real WebSocket server but mocks the chrome-launcher module.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import WebSocket from 'ws';

// Mock chrome-launcher before importing ws-client
vi.mock('../chrome-launcher.js', () => ({
  launchChrome: vi.fn(),
}));

const { WebSocketClient } = await import('../ws-client.js');
const chromeLauncher = await import('../chrome-launcher.js');
const mockLaunchChrome = vi.mocked(chromeLauncher.launchChrome);

type WsClient = Awaited<ReturnType<typeof WebSocketClient.create>>;

let nextPort = 19200;
let wsClient: WsClient | null = null;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  if (wsClient) {
    await wsClient.close().catch(() => {});
    wsClient = null;
  }
  // Allow pending async operations to flush
  await new Promise((r) => setTimeout(r, 100));
});

describe('WebSocketClient.ensureConnected()', () => {
  it('resolves immediately when already connected', async () => {
    const port = nextPort++;
    wsClient = await WebSocketClient.create(port);

    // Simulate extension connecting
    const ext = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve) => ext.on('open', resolve));
    // Wait for server to process connection
    await new Promise((r) => setTimeout(r, 50));

    // Should already be connected — no launch needed
    await wsClient.ensureConnected(1000);
    expect(wsClient.isConnected()).toBe(true);
    expect(mockLaunchChrome).not.toHaveBeenCalled();

    ext.close();
    await new Promise((r) => setTimeout(r, 100));
  });

  it('launches Chrome and waits for connection', async () => {
    const port = nextPort++;
    wsClient = await WebSocketClient.create(port);

    mockLaunchChrome.mockResolvedValue(true);

    // Simulate extension connecting after a short delay (like Chrome launching)
    const connectPromise = wsClient.ensureConnected(5000);
    await new Promise((r) => setTimeout(r, 200));

    const ext = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve) => ext.on('open', resolve));

    await connectPromise;

    expect(mockLaunchChrome).toHaveBeenCalled();
    expect(wsClient.isConnected()).toBe(true);

    ext.close();
    await new Promise((r) => setTimeout(r, 100));
  });

  it('throws when Chrome cannot be launched', async () => {
    const port = nextPort++;
    wsClient = await WebSocketClient.create(port);

    mockLaunchChrome.mockResolvedValue(false);

    await expect(wsClient.ensureConnected(1000)).rejects.toThrow(
      'Could not launch Chrome automatically'
    );
  });

  it('throws extension install message when Chrome was launched but no connection', async () => {
    const port = nextPort++;
    wsClient = await WebSocketClient.create(port);

    mockLaunchChrome.mockResolvedValue(true);

    await expect(wsClient.ensureConnected(500)).rejects.toThrow(
      'WebClaw extension did not connect'
    );
  });

  it('does not launch Chrome again after first launch', async () => {
    const port = nextPort++;
    wsClient = await WebSocketClient.create(port);

    mockLaunchChrome.mockResolvedValue(true);

    // First call: launches Chrome, but times out (no extension connects)
    await expect(wsClient.ensureConnected(300)).rejects.toThrow();
    expect(mockLaunchChrome).toHaveBeenCalledTimes(1);

    // Second call: should NOT launch Chrome again
    mockLaunchChrome.mockClear();
    await expect(wsClient.ensureConnected(300)).rejects.toThrow();
    expect(mockLaunchChrome).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent ensureConnected calls', async () => {
    const port = nextPort++;
    wsClient = await WebSocketClient.create(port);

    mockLaunchChrome.mockResolvedValue(true);

    // Call ensureConnected twice concurrently
    const p1 = wsClient.ensureConnected(5000);
    const p2 = wsClient.ensureConnected(5000);

    // Simulate extension connecting
    await new Promise((r) => setTimeout(r, 200));
    const ext = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve) => ext.on('open', resolve));

    await Promise.all([p1, p2]);

    // launchChrome should only be called once
    expect(mockLaunchChrome).toHaveBeenCalledTimes(1);

    ext.close();
    await new Promise((r) => setTimeout(r, 100));
  });
});

describe('WebSocketClient.request() auto-connect', () => {
  it('calls ensureConnected when not connected', async () => {
    const port = nextPort++;
    wsClient = await WebSocketClient.create(port);

    mockLaunchChrome.mockResolvedValue(true);

    // Start request — it triggers ensureConnected internally
    const requestPromise = wsClient.request('navigate', { url: 'https://example.com' });

    // Simulate extension connecting and set up message handler
    await new Promise((r) => setTimeout(r, 200));
    const ext = new WebSocket(`ws://127.0.0.1:${port}`);

    await new Promise<void>((resolve) => {
      ext.on('open', resolve);
    });

    // Handle incoming request and respond
    ext.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'request') {
        ext.send(JSON.stringify({
          id: msg.id,
          type: 'response',
          method: msg.method,
          payload: { url: 'https://example.com', title: 'Example', tabId: 1 },
          timestamp: Date.now(),
        }));
      }
    });

    const result = await requestPromise;
    expect(result.type).toBe('response');
    expect(mockLaunchChrome).toHaveBeenCalled();

    ext.close();
    await new Promise((r) => setTimeout(r, 100));
  });
});
