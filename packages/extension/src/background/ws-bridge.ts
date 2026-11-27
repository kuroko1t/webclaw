/**
 * WebSocket bridge between MCP Server and Service Worker.
 *
 * Connects to the MCP server's WebSocket endpoint and routes
 * incoming requests through the MessageRouter. The bridge makes one
 * connection attempt per connect() call; when to retry is decided by the
 * caller (see ReconnectScheduler), which hears about each outcome through
 * BridgeEvents.
 */
import type { BridgeMessage, BridgeRequest } from 'webclaw-shared';
import type { MessageRouter } from './message-router';

export interface BridgeEvents {
  /** The connection opened. */
  onOpen?: () => void;
  /**
   * The socket closed. `wasOpen` is true for a disconnect and false when the
   * attempt never connected.
   */
  onClose?: (wasOpen: boolean) => void;
}

export class WebSocketBridge {
  private ws: WebSocket | null = null;
  private url: string;
  private router: MessageRouter;
  private events: BridgeEvents;
  private disposed = false;

  constructor(url: string, router: MessageRouter, events: BridgeEvents = {}) {
    this.url = url;
    this.router = router;
    this.events = events;
  }

  /** Start one connection attempt unless a socket is already open or opening. */
  connect(): void {
    if (this.disposed || this.ws) return;

    let opened = false;
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.events.onClose?.(false);
      return;
    }
    this.ws = ws;

    ws.addEventListener('open', () => {
      opened = true;
      console.log(`[WebClaw Bridge] Connected to MCP server (${this.url})`);
      this.events.onOpen?.();
    });

    ws.addEventListener('message', (event) => {
      this.handleMessage(event.data);
    });

    ws.addEventListener('close', () => {
      if (opened) {
        console.log(`[WebClaw Bridge] Disconnected from MCP server (${this.url})`);
      }
      if (this.ws === ws) this.ws = null;
      if (!this.disposed) this.events.onClose?.(opened);
    });

    ws.addEventListener('error', () => {
      // error event is always followed by close, which reports the outcome
    });
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
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
