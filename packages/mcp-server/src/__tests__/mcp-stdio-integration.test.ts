/**
 * MCP Server stdio integration tests.
 *
 * Spawns `node dist/cli.js` as a child process and communicates
 * via JSON-RPC over stdin/stdout using newline-delimited JSON (NDJSON),
 * which is the framing format used by MCP SDK's StdioServerTransport.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(__dirname, '../../dist/cli.js');

let child: ChildProcess | null = null;
let nextPort = 19080;

/** Send a JSON-RPC message as NDJSON (newline-delimited JSON). */
function sendJsonRpc(proc: ChildProcess, message: object): void {
  proc.stdin!.write(JSON.stringify(message) + '\n');
}

/**
 * Collect NDJSON responses from stdout.
 * Each response is a single line of JSON terminated by \n.
 */
function createResponseCollector(proc: ChildProcess): { responses: any[] } {
  const state = { responses: [] as any[] };
  let buffer = '';

  proc.stdout!.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    // Keep the last (potentially incomplete) line in the buffer
    buffer = lines.pop()!;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        state.responses.push(JSON.parse(trimmed));
      } catch {
        // skip malformed lines
      }
    }
  });

  return state;
}

/** Spawn CLI and wait for it to be fully ready (WebSocket + MCP). */
function spawnAndWaitReady(): Promise<ChildProcess> {
  const port = nextPort++;
  const proc = spawn('node', [cliPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 15000,
    env: { ...process.env, WEBCLAW_PORT: String(port) },
  });

  return new Promise((resolve, reject) => {
    let stderr = '';
    const timeout = setTimeout(() => reject(new Error('Startup timed out')), 10000);
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.includes('MCP Server started')) {
        clearTimeout(timeout);
        resolve(proc);
      }
    });
    proc.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Process exited with code ${code} before ready. stderr: ${stderr}`));
    });
  });
}

afterEach(() => {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
  }
  child = null;
});

describe('MCP Server stdio integration', () => {
  it('responds to initialize request via JSON-RPC', async () => {
    child = await spawnAndWaitReady();

    const collector = createResponseCollector(child);

    sendJsonRpc(child, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-stdio', version: '0.0.1' },
      },
    });

    // Wait for response
    await new Promise((r) => setTimeout(r, 2000));

    expect(collector.responses.length).toBeGreaterThanOrEqual(1);

    const initResponse = collector.responses.find(
      (r: any) => r.id === 1 && r.result
    ) as any;
    expect(initResponse).toBeDefined();
    expect(initResponse.result.serverInfo.name).toBe('webclaw');
    expect(initResponse.result.serverInfo.version).toBe('0.2.0');
  }, 20000);

  it('lists 8 tools via JSON-RPC after initialization', async () => {
    child = await spawnAndWaitReady();

    const collector = createResponseCollector(child);

    // Send initialize
    sendJsonRpc(child, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-stdio', version: '0.0.1' },
      },
    });

    await new Promise((r) => setTimeout(r, 1500));

    // Send initialized notification
    sendJsonRpc(child, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });

    await new Promise((r) => setTimeout(r, 200));

    // Send tools/list
    sendJsonRpc(child, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });

    await new Promise((r) => setTimeout(r, 1500));

    const toolsResponse = collector.responses.find(
      (r: any) => r.id === 2 && r.result
    );
    expect(toolsResponse).toBeDefined();
    expect(toolsResponse.result.tools).toHaveLength(8);

    const toolNames = toolsResponse.result.tools
      .map((t: any) => t.name)
      .sort();
    expect(toolNames).toEqual([
      'click',
      'invoke_webmcp_tool',
      'list_webmcp_tools',
      'navigate_to',
      'page_snapshot',
      'screenshot',
      'select_option',
      'type_text',
    ]);
  }, 20000);

  it('each tool schema from stdio has correct structure', async () => {
    child = await spawnAndWaitReady();

    const collector = createResponseCollector(child);

    sendJsonRpc(child, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '0.0.1' },
      },
    });

    await new Promise((r) => setTimeout(r, 1500));

    sendJsonRpc(child, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
    await new Promise((r) => setTimeout(r, 200));

    sendJsonRpc(child, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });
    await new Promise((r) => setTimeout(r, 1500));

    const toolsResponse = collector.responses.find(
      (r: any) => r.id === 2 && r.result
    );
    expect(toolsResponse).toBeDefined();

    for (const tool of toolsResponse.result.tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  }, 20000);
});
