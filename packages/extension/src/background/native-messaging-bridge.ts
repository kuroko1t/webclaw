/**
 * Native Messaging bridge between MCP Server and Service Worker.
 * Handles 32-bit length-prefixed JSON messages over stdio.
 */
import type { BridgeMessage, BridgeRequest } from '@webclaw/shared';
import type { MessageRouter } from './message-router';

export class NativeMessagingBridge {
  private port: chrome.runtime.Port;
  private router: MessageRouter;
  private connected = true;

  constructor(port: chrome.runtime.Port, router: MessageRouter) {
    this.port = port;
    this.router = router;
    this.setup();
  }

  private setup(): void {
    this.port.onMessage.addListener((message: unknown) => {
      this.handleMessage(message);
    });

    this.port.onDisconnect.addListener(() => {
      this.connected = false;
      console.log(
        '[WebClaw Bridge] Disconnected:',
        chrome.runtime.lastError?.message
      );
    });
  }

  private async handleMessage(raw: unknown): Promise<void> {
    try {
      const message = raw as BridgeRequest;

      if (!message.id || !message.method) {
        console.error('[WebClaw Bridge] Invalid message:', raw);
        return;
      }

      console.log(`[WebClaw Bridge] Request: ${message.method}`, message.id);

      // Send ACK immediately
      this.send({
        id: message.id,
        type: 'ack',
        method: message.method,
        payload: {},
        timestamp: Date.now(),
      });

      // Route and handle
      const response = await this.router.handleBridgeRequest(message);
      this.send(response);
    } catch (err) {
      console.error('[WebClaw Bridge] Error handling message:', err);
      const msg = raw as { id?: string; method?: string };
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
    }
  }

  send(message: BridgeMessage): void {
    if (!this.connected) {
      console.warn('[WebClaw Bridge] Cannot send, disconnected');
      return;
    }
    try {
      this.port.postMessage(message);
    } catch (err) {
      console.error('[WebClaw Bridge] Send error:', err);
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  disconnect(): void {
    this.connected = false;
    this.port.disconnect();
  }
}
