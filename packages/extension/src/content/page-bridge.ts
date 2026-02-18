/**
 * Page bridge script injected into MAIN world.
 * Accesses navigator.modelContext and communicates results
 * back to the ISOLATED content script via window.postMessage.
 */

const CHANNEL = 'webclaw-page-bridge';

// Listen for discovery requests from content script
window.addEventListener('message', async (event) => {
  if (event.source !== window) return;
  if (event.data?.channel !== CHANNEL) return;

  if (event.data.type === 'discover-webmcp-tools') {
    await handleDiscoverTools();
  }

  if (event.data.type === 'invoke-webmcp-tool') {
    await handleInvokeTool(
      event.data.requestId,
      event.data.toolName,
      event.data.args
    );
  }
});

async function handleDiscoverTools(): Promise<void> {
  try {
    // Check for WebMCP support
    const mc = (navigator as unknown as { modelContext?: ModelContextAPI }).modelContext;
    if (!mc) {
      window.postMessage(
        { channel: CHANNEL, type: 'webmcp-tools-result', tools: [] },
        '*'
      );
      return;
    }

    const server = await mc.server;
    const tools = server?.tools ?? [];

    window.postMessage(
      {
        channel: CHANNEL,
        type: 'webmcp-tools-result',
        tools: tools.map((t: WebMCPToolDef) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      },
      '*'
    );
  } catch (err) {
    console.error('[WebClaw PageBridge] Discovery error:', err);
    window.postMessage(
      { channel: CHANNEL, type: 'webmcp-tools-result', tools: [] },
      '*'
    );
  }
}

async function handleInvokeTool(
  requestId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<void> {
  try {
    const mc = (navigator as unknown as { modelContext?: ModelContextAPI }).modelContext;
    if (!mc) {
      window.postMessage(
        {
          channel: CHANNEL,
          type: 'webmcp-invoke-result',
          requestId,
          result: {
            success: false,
            error: 'WebMCP not supported on this page',
          },
        },
        '*'
      );
      return;
    }

    const result = await mc.callTool(toolName, args);

    window.postMessage(
      {
        channel: CHANNEL,
        type: 'webmcp-invoke-result',
        requestId,
        result: { success: true, result },
      },
      '*'
    );
  } catch (err) {
    window.postMessage(
      {
        channel: CHANNEL,
        type: 'webmcp-invoke-result',
        requestId,
        result: {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        },
      },
      '*'
    );
  }
}

// Type stubs for navigator.modelContext (WebMCP W3C API)
interface WebMCPToolDef {
  name: string;
  description: string;
  inputSchema: unknown;
}

interface ModelContextAPI {
  server: Promise<{ tools: WebMCPToolDef[] } | null>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
}
