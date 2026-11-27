/**
 * Details from the extension that the tool results pass on: how drop_files
 * delivered the files and the warning of a type_text synthetic fallback.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createWebClawServer } from '../server.js';
import type { WebSocketClient } from '../ws-client.js';
import type { BridgeMethod } from 'webclaw-shared';

const PAYLOADS: Partial<Record<BridgeMethod, unknown>> = {
  newTab: { tabId: 7 },
  dropFiles: { success: true, method: 'nearest-file-input' },
  typeText: { success: true, trusted: false, warning: 'Trusted input failed: Could not attach the debugger' },
};

const requestWithRetry = vi.fn(async (method: BridgeMethod) => ({
  id: 'mock-id',
  type: 'response' as const,
  method,
  payload: PAYLOADS[method] ?? { success: true },
  timestamp: Date.now(),
}));

const SOME_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../../package.json');

function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
  return (result.content as Array<{ text: string }>)[0].text;
}

describe('tool result details', () => {
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

  it('drop_files reports how the files were delivered', async () => {
    const result = await mcpClient.callTool({
      name: 'drop_files',
      arguments: {
        ref: '@e3',
        snapshotId: 'snap-1',
        files: [{ name: 'a.json', mimeType: 'application/json', filePath: SOME_FILE }],
      },
    });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toBe('Dropped 1 file(s) onto @e3 (nearest-file-input): a.json');
  });

  it('type_text passes on the warning of a synthetic fallback', async () => {
    const result = await mcpClient.callTool({
      name: 'type_text',
      arguments: { ref: '@e1', text: 'a\n', snapshotId: 'snap-1', pressKeys: true },
    });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toBe(
      'Typed "a\n" into @e1\nWarning: Trusted input failed: Could not attach the debugger'
    );
  });
});
