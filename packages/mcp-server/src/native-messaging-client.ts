/**
 * Native Messaging client for communicating with the Chrome Extension.
 *
 * Native Messaging uses 32-bit length-prefixed JSON messages over stdio.
 * The host process communicates with the Chrome Extension Service Worker.
 */
import type { BridgeMessage, BridgeMethod } from 'webclaw-shared';
import { createRequest, isBridgeMessage } from 'webclaw-shared';

interface PendingRequest {
  resolve: (value: BridgeMessage) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface NativeMessagingStreams {
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
}

export class NativeMessagingClient {
  private pendingRequests = new Map<string, PendingRequest>();
  private connected = false;
  private messageBuffer = Buffer.alloc(0);
  private stdin: NodeJS.ReadableStream;
  private stdout: NodeJS.WritableStream;

  constructor(streams?: NativeMessagingStreams) {
    this.stdin = streams?.stdin ?? process.stdin;
    this.stdout = streams?.stdout ?? process.stdout;
    this.setupStdioListener();
  }

  private setupStdioListener(): void {
    this.stdin.on('data', (chunk: Buffer) => {
      this.messageBuffer = Buffer.concat([this.messageBuffer, chunk]);
      this.processBuffer();
    });

    this.stdin.on('end', () => {
      this.connected = false;
      // Reject all pending requests
      for (const [id, pending] of this.pendingRequests) {
        pending.reject(new Error('Native messaging connection closed'));
        clearTimeout(pending.timer);
      }
      this.pendingRequests.clear();
    });

    this.connected = true;
  }

  private processBuffer(): void {
    while (this.messageBuffer.length >= 4) {
      const messageLength = this.messageBuffer.readUInt32LE(0);

      if (this.messageBuffer.length < 4 + messageLength) {
        break; // Wait for more data
      }

      const messageData = this.messageBuffer.subarray(4, 4 + messageLength);
      this.messageBuffer = this.messageBuffer.subarray(4 + messageLength);

      try {
        const message = JSON.parse(messageData.toString('utf-8'));
        this.handleMessage(message);
      } catch (err) {
        console.error('[NativeMessaging] Failed to parse message:', err);
      }
    }
  }

  private handleMessage(message: unknown): void {
    if (!isBridgeMessage(message)) {
      console.error('[NativeMessaging] Invalid message format:', message);
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

  /** Send a message to the Chrome Extension */
  sendMessage(message: BridgeMessage): void {
    const json = JSON.stringify(message);
    const buffer = Buffer.from(json, 'utf-8');
    const header = Buffer.alloc(4);
    header.writeUInt32LE(buffer.length, 0);
    this.stdout.write(header);
    this.stdout.write(buffer);
  }

  /** Send a request and wait for the response */
  async request(
    method: BridgeMethod,
    payload: unknown = {},
    timeoutMs = 60_000
  ): Promise<BridgeMessage> {
    const request = createRequest(method, payload);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        reject(new Error(`Request ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(request.id, { resolve, reject, timer });
      this.sendMessage(request);
    });
  }

  isConnected(): boolean {
    return this.connected;
  }

  disconnect(): void {
    this.connected = false;
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Disconnected'));
    }
    this.pendingRequests.clear();
  }
}
