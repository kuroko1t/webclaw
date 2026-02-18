/**
 * MCP Protocol in-process integration tests.
 *
 * Uses MCP SDK Client + InMemoryTransport to perform a real protocol
 * handshake and tool invocations against the actual server, with a
 * mocked NativeMessagingClient.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { PassThrough } from 'node:stream';
import { createWebClawServer } from '../server.js';
import { NativeMessagingClient } from '../native-messaging-client.js';

/** Helper: encode a native-messaging–format response and push it to the stdin PassThrough. */
function sendNativeResponse(
  stdin: PassThrough,
  id: string,
  method: string,
  payload: unknown
): void {
  const msg = JSON.stringify({ id, type: 'response', method, payload, timestamp: Date.now() });
  const body = Buffer.from(msg, 'utf-8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  stdin.write(Buffer.concat([header, body]));
}

function createMockNativeClient(): {
  client: NativeMessagingClient;
  stdin: PassThrough;
  stdout: PassThrough;
} {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const client = new NativeMessagingClient({ stdin, stdout });
  return { client, stdin, stdout };
}

/** Decode outgoing native-messaging messages captured from stdout. */
function decodeNativeMessages(buf: Buffer): Array<{ id: string; method: string; payload: unknown }> {
  const messages: Array<{ id: string; method: string; payload: unknown }> = [];
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

const EXPECTED_TOOLS = [
  'navigate_to',
  'page_snapshot',
  'click',
  'type_text',
  'select_option',
  'list_webmcp_tools',
  'invoke_webmcp_tool',
  'screenshot',
];

describe('MCP Protocol integration (in-process)', () => {
  let mcpClient: Client;
  let nativeStdin: PassThrough;
  let nativeStdout: PassThrough;
  let nativeClient: NativeMessagingClient;

  beforeAll(async () => {
    const mock = createMockNativeClient();
    nativeStdin = mock.stdin;
    nativeStdout = mock.stdout;
    nativeClient = mock.client;

    const server = createWebClawServer({ nativeClient });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    mcpClient = new Client({ name: 'test-client', version: '0.0.1' });

    await server.connect(serverTransport);
    await mcpClient.connect(clientTransport);
  });

  afterAll(async () => {
    await mcpClient.close();
    nativeClient.disconnect();
  });

  // --- Handshake ---
  it('completes initialize handshake and returns server info', () => {
    const serverVersion = mcpClient.getServerVersion();
    expect(serverVersion).toBeDefined();
    expect(serverVersion!.name).toBe('webclaw');
    expect(serverVersion!.version).toBe('0.1.0');
  });

  // --- tools/list ---
  it('lists all 8 tools', async () => {
    const result = await mcpClient.listTools();
    expect(result.tools).toHaveLength(8);
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

  // --- Tool invocation with mock NativeMessagingClient ---
  it('navigate_to returns formatted response from native client', async () => {
    // Capture outgoing request to respond to it
    const chunks: Buffer[] = [];
    nativeStdout.on('data', (chunk: Buffer) => chunks.push(chunk));

    const toolPromise = mcpClient.callTool({
      name: 'navigate_to',
      arguments: { url: 'https://example.com' },
    });

    // Wait for the request to be sent through native messaging
    await new Promise((r) => setTimeout(r, 50));

    const combined = Buffer.concat(chunks);
    const sent = decodeNativeMessages(combined);
    const req = sent.find((m) => m.method === 'navigate');
    expect(req).toBeDefined();

    sendNativeResponse(nativeStdin, req!.id, 'navigate', {
      url: 'https://example.com',
      title: 'Example Domain',
      tabId: 1,
    });

    const result = await toolPromise;
    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain('Example Domain');
    expect(text).toContain('https://example.com');

    nativeStdout.removeAllListeners('data');
  });

  it('page_snapshot returns formatted snapshot from native client', async () => {
    const chunks: Buffer[] = [];
    nativeStdout.on('data', (chunk: Buffer) => chunks.push(chunk));

    const toolPromise = mcpClient.callTool({
      name: 'page_snapshot',
      arguments: {},
    });

    await new Promise((r) => setTimeout(r, 50));
    const combined = Buffer.concat(chunks);
    const sent = decodeNativeMessages(combined);
    const req = sent.find((m) => m.method === 'snapshot');
    expect(req).toBeDefined();

    sendNativeResponse(nativeStdin, req!.id, 'snapshot', {
      text: '[page "Test"]\n  [button "Click"]',
      snapshotId: 'snap-123',
      url: 'https://example.com',
      title: 'Test Page',
    });

    const result = await toolPromise;
    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain('Test Page');
    expect(text).toContain('snap-123');

    nativeStdout.removeAllListeners('data');
  });

  it('tool returning error response sets isError', async () => {
    const chunks: Buffer[] = [];
    nativeStdout.on('data', (chunk: Buffer) => chunks.push(chunk));

    const toolPromise = mcpClient.callTool({
      name: 'page_snapshot',
      arguments: {},
    });

    await new Promise((r) => setTimeout(r, 50));
    const combined = Buffer.concat(chunks);
    const sent = decodeNativeMessages(combined);
    const req = sent.find((m) => m.method === 'snapshot');

    // Send an error response
    const msg = JSON.stringify({
      id: req!.id,
      type: 'error',
      method: 'snapshot',
      payload: { code: 'NO_TAB', message: 'No active tab' },
      timestamp: Date.now(),
    });
    const body = Buffer.from(msg, 'utf-8');
    const header = Buffer.alloc(4);
    header.writeUInt32LE(body.length, 0);
    nativeStdin.write(Buffer.concat([header, body]));

    const result = await toolPromise;
    expect(result.isError).toBe(true);

    nativeStdout.removeAllListeners('data');
  });
});
