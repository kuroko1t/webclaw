/**
 * WebSocket-based client for communicating with the Chrome Extension.
 *
 * Replaces NativeMessagingClient. Runs a WebSocket server on localhost
 * that the extension's Service Worker connects to.
 *
 * When a tool request is made and the extension is not connected,
 * automatically detects/launches Chrome and waits for the extension
 * to connect.
 */
import { WebSocketServer, WebSocket } from 'ws';
import type { BridgeMessage, BridgeMethod } from 'webclaw-shared';
import { createRequest, isBridgeMessage } from 'webclaw-shared';
import { launchChrome } from './chrome-launcher.js';

interface PendingRequest {
  resolve: (value: BridgeMessage) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Default timeout for waiting for Chrome extension to connect. */
const ENSURE_CONNECTED_TIMEOUT_MS = 15_000;

export class WebSocketClient {
  private wss: WebSocketServer;
  private connection: WebSocket | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private connectingPromise: Promise<void> | null = null;
  private chromeLaunched = false;

  private constructor(wss: WebSocketServer) {
    this.wss = wss;

    this.wss.on('error', (err) => {
      console.error('[WebClaw WS] Server error:', err.message);
    });

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

  /** Create a WebSocketClient and wait for the server to be listening. */
  static async create(port: number, host = '127.0.0.1'): Promise<WebSocketClient> {
    const wss = new WebSocketServer({ port, host });
    await new Promise<void>((resolve, reject) => {
      wss.once('listening', resolve);
      wss.once('error', reject);
    });
    return new WebSocketClient(wss);
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

  /**
   * Ensure the Chrome extension is connected.
   *
   * If not connected:
   * 1. If Chrome hasn't been launched yet this session, launch it
   * 2. Wait for the extension to connect (up to timeoutMs)
   * 3. If extension doesn't connect, suggest installing the extension
   *
   * Chrome is only launched once per session to prevent multiple instances.
   */
  async ensureConnected(timeoutMs = ENSURE_CONNECTED_TIMEOUT_MS): Promise<void> {
    if (this.isConnected()) return;

    // Deduplicate concurrent calls
    if (this.connectingPromise) return this.connectingPromise;

    this.connectingPromise = this._doEnsureConnected(timeoutMs);
    try {
      await this.connectingPromise;
    } finally {
      this.connectingPromise = null;
    }
  }

  private async _doEnsureConnected(timeoutMs: number): Promise<void> {
    if (!this.chromeLaunched) {
      console.error('[WebClaw] Chrome extension not connected. Launching Chrome...');
      const launched = await launchChrome();
      if (!launched) {
        throw new Error(
          'Could not launch Chrome automatically.\n' +
          'Please start Chrome manually with the WebClaw extension installed.'
        );
      }
      this.chromeLaunched = true;
      console.error('[WebClaw] Chrome launched. Waiting for extension to connect...');
    } else {
      console.error('[WebClaw] Waiting for Chrome extension to reconnect...');
    }

    // Wait for extension to connect via WebSocket
    return new Promise<void>((resolve, reject) => {
      // Check again — might have connected while we were launching Chrome
      if (this.isConnected()) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        this.wss.removeListener('connection', onConnection);

        reject(new Error(
          'Chrome was launched but the WebClaw extension did not connect.\n' +
          'Please ensure the WebClaw extension is installed and enabled:\n' +
          '  1. Open chrome://extensions/\n' +
          '  2. Enable Developer mode\n' +
          '  3. Click "Load unpacked" and select the extension dist/ folder\n' +
          '  4. Verify the extension is enabled'
        ));
      }, timeoutMs);

      const onConnection = () => {
        clearTimeout(timeout);
        // Small delay to let the connection handler in constructor finish setting up
        setTimeout(() => resolve(), 50);
      };

      this.wss.once('connection', onConnection);
    });
  }

  /** Send a request and wait for the response. Auto-connects if needed. */
  async request(
    method: BridgeMethod,
    payload: unknown = {},
    timeoutMs = 60_000
  ): Promise<BridgeMessage> {
    // Auto-connect: launch Chrome if needed and wait for extension
    if (!this.isConnected()) {
      await this.ensureConnected();
    }

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
