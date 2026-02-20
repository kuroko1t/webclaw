/**
 * WebSocket-based client for communicating with the Chrome Extension.
 *
 * Replaces NativeMessagingClient. Runs a WebSocket server on localhost
 * that the extension's Service Worker connects to.
 */
import { WebSocketServer, WebSocket } from 'ws';
import type { BridgeMessage, BridgeMethod } from 'webclaw-shared';
import { createRequest, isBridgeMessage } from 'webclaw-shared';

interface PendingRequest {
  resolve: (value: BridgeMessage) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class WebSocketClient {
  private wss: WebSocketServer;
  private connection: WebSocket | null = null;
  private pendingRequests = new Map<string, PendingRequest>();

  constructor(port: number, host = '127.0.0.1') {
    this.wss = new WebSocketServer({ port, host });

    this.wss.on('connection', (ws) => {
      // Only allow one connection; close the previous one
      if (this.connection && this.connection.readyState === WebSocket.OPEN) {
        this.connection.close();
      }
      this.connection = ws;
      console.error(`[WebClaw] Extension connected`);

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (err) {
          console.error('[WebClaw WS] Failed to parse message:', err);
        }
      });

      ws.on('close', () => {
        if (this.connection === ws) {
          this.connection = null;
          console.error('[WebClaw] Extension disconnected');
        }
      });

      ws.on('error', (err) => {
        console.error('[WebClaw WS] Connection error:', err.message);
      });
    });
  }

  private handleMessage(message: unknown): void {
    if (!isBridgeMessage(message)) {
      console.error('[WebClaw WS] Invalid message format:', message);
      return;
    }

    const bridgeMessage = message as BridgeMessage;

    // ACKs are informational, skip
    if (bridgeMessage.type === 'ack') return;

    const pending = this.pendingRequests.get(bridgeMessage.id);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingRequests.delete(bridgeMessage.id);
      pending.resolve(bridgeMessage);
    }
  }

  /** Send a request and wait for the response */
  async request(
    method: BridgeMethod,
    payload: unknown = {},
    timeoutMs = 60_000
  ): Promise<BridgeMessage> {
    if (!this.connection || this.connection.readyState !== WebSocket.OPEN) {
      throw new Error('Chrome extension is not connected');
    }

    const request = createRequest(method, payload);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        reject(new Error(`Request ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(request.id, { resolve, reject, timer });
      this.connection!.send(JSON.stringify(request));
    });
  }

  isConnected(): boolean {
    return this.connection !== null && this.connection.readyState === WebSocket.OPEN;
  }

  async close(): Promise<void> {
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('WebSocket server closing'));
    }
    this.pendingRequests.clear();

    if (this.connection) {
      this.connection.close();
      this.connection = null;
    }

    return new Promise((resolve) => {
      this.wss.close(() => resolve());
    });
  }
}
