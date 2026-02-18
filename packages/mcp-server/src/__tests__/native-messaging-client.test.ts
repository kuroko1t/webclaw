import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { NativeMessagingClient } from '../native-messaging-client.js';

/** Encode a message with 32-bit length prefix (Native Messaging format) */
function encodeNativeMessage(obj: unknown): Buffer {
  const json = JSON.stringify(obj);
  const body = Buffer.from(json, 'utf-8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  return Buffer.concat([header, body]);
}

/** Decode a native messaging buffer into messages */
function decodeNativeMessages(buf: Buffer): unknown[] {
  const messages: unknown[] = [];
  let offset = 0;
  while (offset + 4 <= buf.length) {
    const len = buf.readUInt32LE(offset);
    if (offset + 4 + len > buf.length) break;
    const data = buf.subarray(offset + 4, offset + 4 + len);
    messages.push(JSON.parse(data.toString('utf-8')));
    offset += 4 + len;
  }
  return messages;
}

function createTestClient() {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const client = new NativeMessagingClient({ stdin, stdout });
  return { client, stdin, stdout };
}

describe('NativeMessagingClient', () => {
  it('starts connected', () => {
    const { client } = createTestClient();
    expect(client.isConnected()).toBe(true);
    client.disconnect();
  });

  it('sends length-prefixed JSON messages', () => {
    const { client, stdout } = createTestClient();
    const chunks: Buffer[] = [];
    stdout.on('data', (chunk: Buffer) => chunks.push(chunk));

    client.sendMessage({
      id: 'test-1',
      type: 'request',
      method: 'ping',
      payload: {},
      timestamp: 1000,
    });

    const combined = Buffer.concat(chunks);
    const messages = decodeNativeMessages(combined);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({
      id: 'test-1',
      type: 'request',
      method: 'ping',
      payload: {},
      timestamp: 1000,
    });

    client.disconnect();
  });

  it('resolves pending requests when response received', async () => {
    const { client, stdin, stdout } = createTestClient();

    // Capture the outgoing request to get its ID
    const chunks: Buffer[] = [];
    stdout.on('data', (chunk: Buffer) => chunks.push(chunk));

    const requestPromise = client.request('ping', {}, 5000);

    // Wait a tick for the request to be sent
    await new Promise((r) => setTimeout(r, 10));

    const combined = Buffer.concat(chunks);
    const sentMessages = decodeNativeMessages(combined);
    const sentRequest = sentMessages[0] as { id: string };

    // Send a response back through stdin
    const response = encodeNativeMessage({
      id: sentRequest.id,
      type: 'response',
      method: 'ping',
      payload: { pong: true },
      timestamp: Date.now(),
    });
    stdin.write(response);

    const result = await requestPromise;
    expect(result.type).toBe('response');
    expect(result.payload).toEqual({ pong: true });

    client.disconnect();
  });

  it('ignores ACK messages', async () => {
    const { client, stdin, stdout } = createTestClient();

    const chunks: Buffer[] = [];
    stdout.on('data', (chunk: Buffer) => chunks.push(chunk));

    const requestPromise = client.request('ping', {}, 5000);
    await new Promise((r) => setTimeout(r, 10));

    const combined = Buffer.concat(chunks);
    const sentMessages = decodeNativeMessages(combined);
    const sentRequest = sentMessages[0] as { id: string };

    // Send ACK first - should not resolve
    stdin.write(
      encodeNativeMessage({
        id: sentRequest.id,
        type: 'ack',
        method: 'ping',
        payload: {},
        timestamp: Date.now(),
      })
    );

    // Wait a bit - should still be pending
    await new Promise((r) => setTimeout(r, 20));

    // Now send actual response
    stdin.write(
      encodeNativeMessage({
        id: sentRequest.id,
        type: 'response',
        method: 'ping',
        payload: { pong: true },
        timestamp: Date.now(),
      })
    );

    const result = await requestPromise;
    expect(result.type).toBe('response');

    client.disconnect();
  });

  it('times out if no response', async () => {
    const { client } = createTestClient();

    await expect(client.request('ping', {}, 50)).rejects.toThrow('timed out');

    client.disconnect();
  });

  it('handles multiple messages in a single buffer', async () => {
    const { client, stdin, stdout } = createTestClient();

    const chunks: Buffer[] = [];
    stdout.on('data', (chunk: Buffer) => chunks.push(chunk));

    const p1 = client.request('ping', { n: 1 }, 5000);
    const p2 = client.request('ping', { n: 2 }, 5000);

    await new Promise((r) => setTimeout(r, 10));

    const combined = Buffer.concat(chunks);
    const sentMessages = decodeNativeMessages(combined) as { id: string }[];

    // Send both responses in a single buffer
    const r1 = encodeNativeMessage({
      id: sentMessages[0].id,
      type: 'response',
      method: 'ping',
      payload: { n: 1 },
      timestamp: Date.now(),
    });
    const r2 = encodeNativeMessage({
      id: sentMessages[1].id,
      type: 'response',
      method: 'ping',
      payload: { n: 2 },
      timestamp: Date.now(),
    });
    stdin.write(Buffer.concat([r1, r2]));

    const [res1, res2] = await Promise.all([p1, p2]);
    expect((res1.payload as { n: number }).n).toBe(1);
    expect((res2.payload as { n: number }).n).toBe(2);

    client.disconnect();
  });

  it('handles partial messages across chunks', async () => {
    const { client, stdin, stdout } = createTestClient();

    const chunks: Buffer[] = [];
    stdout.on('data', (chunk: Buffer) => chunks.push(chunk));

    const requestPromise = client.request('ping', {}, 5000);
    await new Promise((r) => setTimeout(r, 10));

    const combined = Buffer.concat(chunks);
    const sentMessages = decodeNativeMessages(combined) as { id: string }[];

    const response = encodeNativeMessage({
      id: sentMessages[0].id,
      type: 'response',
      method: 'ping',
      payload: { ok: true },
      timestamp: Date.now(),
    });

    // Send in two chunks
    const mid = Math.floor(response.length / 2);
    stdin.write(response.subarray(0, mid));
    await new Promise((r) => setTimeout(r, 10));
    stdin.write(response.subarray(mid));

    const result = await requestPromise;
    expect(result.type).toBe('response');
    expect((result.payload as { ok: boolean }).ok).toBe(true);

    client.disconnect();
  });

  it('disconnect rejects all pending requests', async () => {
    const { client } = createTestClient();

    const p = client.request('ping', {}, 60000);
    client.disconnect();

    await expect(p).rejects.toThrow('Disconnected');
    expect(client.isConnected()).toBe(false);
  });

  it('rejects pending on stdin end', async () => {
    const { client, stdin } = createTestClient();

    const p = client.request('ping', {}, 60000);

    // Attach rejection handler BEFORE ending stdin to avoid unhandled rejection
    const resultPromise = p.catch((err: Error) => err);

    stdin.end();
    await new Promise((r) => setTimeout(r, 50));

    const result = await resultPromise;
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toContain('Native messaging connection closed');
  });
});
