/**
 * WebSocket bridge between MCP Server and Service Worker.
 *
 * Connects to the MCP server's WebSocket endpoint and routes
 * incoming requests through the MessageRouter.
 */
import type { BridgeMessage, BridgeRequest } from 'webclaw-shared';
import type { MessageRouter } from './message-router';

const RECONNECT_INTERVAL_MS = 3_000;

export class WebSocketBridge {
  private ws: WebSocket | null = null;
  private url: string;
  private router: MessageRouter;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(url: string, router: MessageRouter) {
    this.url = url;
    this.router = router;
    this.connect();
  }

  private connect(): void {
    if (this.disposed) return;

    try {
      this.ws = new WebSocket(this.url);

      this.ws.addEventListener('open', () => {
        console.log('[WebClaw Bridge] Connected to MCP server');
      });

      this.ws.addEventListener('message', (event) => {
        this.handleMessage(event.data);
      });

      this.ws.addEventListener('close', () => {
        console.log('[WebClaw Bridge] Disconnected from MCP server');
        this.ws = null;
        this.scheduleReconnect();
      });

      this.ws.addEventListener('error', () => {
        // error event is always followed by close, so reconnect happens there
      });
    } catch {
      this.ws = null;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_INTERVAL_MS);
  }

  private async handleMessage(data: unknown): Promise<void> {
    try {
      const message = typeof data === 'string' ? JSON.parse(data) : null;
      if (!message) return;

      const request = message as BridgeRequest;
      if (!request.id || !request.method) {
        console.error('[WebClaw Bridge] Invalid message:', message);
        return;
      }

      console.log(`[WebClaw Bridge] Request: ${request.method}`, request.id);

      // Send ACK immediately
      this.send({
        id: request.id,
        type: 'ack',
        method: request.method,
        payload: {},
        timestamp: Date.now(),
      });

      // Route and handle
      const response = await this.router.handleBridgeRequest(request);
      this.send(response);
    } catch (err) {
      console.error('[WebClaw Bridge] Error handling message:', err);
      try {
        const msg = typeof data === 'string' ? JSON.parse(data) : {} as { id?: string; method?: string };
        this.send({
          id: msg.id ?? 'unknown',
          type: 'error',
          method: msg.method ?? 'unknown',
          payload: {
            code: 'INTERNAL_ERROR',
            message: err instanceof Error ? err.message : String(err),
          },
          timestamp: Date.now(),
        });
      } catch {
        // Cannot send error response
      }
    }
  }

  send(message: BridgeMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WebClaw Bridge] Cannot send, not connected');
      return;
    }
    try {
      this.ws.send(JSON.stringify(message));
    } catch (err) {
      console.error('[WebClaw Bridge] Send error:', err);
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  disconnect(): void {
    this.disposed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
