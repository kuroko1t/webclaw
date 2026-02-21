import { describe, it, expect, afterEach } from 'vitest';
import { WebSocketClient } from '../ws-client.js';

const BASE_PORT = 19500; // Use a high port range to avoid conflicts with other tests

describe('Port scanning', () => {
  const clients: WebSocketClient[] = [];

  afterEach(async () => {
    await Promise.all(clients.map((c) => c.close()));
    clients.length = 0;
  });

  it('binds to the first available port', async () => {
    const client = await WebSocketClient.create(BASE_PORT);
    clients.push(client);
    expect(client).toBeDefined();
    expect(client.isConnected()).toBe(false); // No extension connected yet
  });

  it('skips a port already in use and binds to the next one', async () => {
    // Occupy the first port
    const first = await WebSocketClient.create(BASE_PORT + 10);
    clients.push(first);

    // Try to bind the same port — should fail with EADDRINUSE
    await expect(WebSocketClient.create(BASE_PORT + 10)).rejects.toThrow();

    // Bind the next port — should succeed
    const second = await WebSocketClient.create(BASE_PORT + 11);
    clients.push(second);
    expect(second).toBeDefined();
  });

  it('binds multiple servers to sequential ports', async () => {
    for (let i = 0; i < 3; i++) {
      const client = await WebSocketClient.create(BASE_PORT + 20 + i);
      clients.push(client);
    }
    expect(clients).toHaveLength(3);
  });
});
