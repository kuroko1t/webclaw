import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock chrome APIs
vi.stubGlobal('chrome', {
  runtime: {
    lastError: null,
  },
});

import { NativeMessagingBridge } from '../background/native-messaging-bridge';
import type { MessageRouter } from '../background/message-router';

function createMockPort() {
  const listeners: Record<string, Function[]> = {
    message: [],
    disconnect: [],
  };

  return {
    onMessage: {
      addListener: vi.fn((fn: Function) => listeners.message.push(fn)),
    },
    onDisconnect: {
      addListener: vi.fn((fn: Function) => listeners.disconnect.push(fn)),
    },
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    // Helpers for testing
    _emit(event: 'message' | 'disconnect', data?: unknown) {
      for (const fn of listeners[event]) {
        fn(data);
      }
    },
  };
}

function createMockRouter(): MessageRouter {
  return {
    handleBridgeRequest: vi.fn().mockResolvedValue({
      id: 'req-1',
      type: 'response',
      method: 'ping',
      payload: { pong: true },
      timestamp: Date.now(),
    }),
    handleContentScriptMessage: vi.fn(),
  } as unknown as MessageRouter;
}

describe('NativeMessagingBridge', () => {
  let mockPort: ReturnType<typeof createMockPort>;
  let mockRouter: MessageRouter;
  let bridge: NativeMessagingBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPort = createMockPort();
    mockRouter = createMockRouter();
    bridge = new NativeMessagingBridge(
      mockPort as unknown as chrome.runtime.Port,
      mockRouter
    );
  });

  describe('setup', () => {
    it('registers message and disconnect listeners', () => {
      expect(mockPort.onMessage.addListener).toHaveBeenCalledOnce();
      expect(mockPort.onDisconnect.addListener).toHaveBeenCalledOnce();
    });
  });

  describe('handleMessage', () => {
    it('sends ACK immediately on valid request', async () => {
      mockPort._emit('message', {
        id: 'req-1',
        method: 'ping',
        payload: {},
      });

      // Wait for async processing
      await vi.waitFor(() => {
        expect(mockPort.postMessage).toHaveBeenCalled();
      });

      // First call should be ACK
      const ackCall = mockPort.postMessage.mock.calls[0][0];
      expect(ackCall.type).toBe('ack');
      expect(ackCall.id).toBe('req-1');
      expect(ackCall.method).toBe('ping');
    });

    it('routes request to MessageRouter and sends response', async () => {
      mockPort._emit('message', {
        id: 'req-2',
        method: 'snapshot',
        payload: { maxTokens: 1000 },
      });

      await vi.waitFor(() => {
        expect(mockPort.postMessage).toHaveBeenCalledTimes(2);
      });

      expect(mockRouter.handleBridgeRequest).toHaveBeenCalledWith({
        id: 'req-2',
        method: 'snapshot',
        payload: { maxTokens: 1000 },
      });

      // Second call should be the response
      const responseCall = mockPort.postMessage.mock.calls[1][0];
      expect(responseCall.type).toBe('response');
    });

    it('ignores messages without id', async () => {
      mockPort._emit('message', { method: 'ping' });

      // Give time for async processing
      await new Promise((r) => setTimeout(r, 50));

      expect(mockRouter.handleBridgeRequest).not.toHaveBeenCalled();
      expect(mockPort.postMessage).not.toHaveBeenCalled();
    });

    it('ignores messages without method', async () => {
      mockPort._emit('message', { id: 'req-1' });

      await new Promise((r) => setTimeout(r, 50));

      expect(mockRouter.handleBridgeRequest).not.toHaveBeenCalled();
    });

    it('sends error response on handler failure', async () => {
      (mockRouter.handleBridgeRequest as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Handler failed')
      );

      mockPort._emit('message', {
        id: 'req-fail',
        method: 'snapshot',
        payload: {},
      });

      await vi.waitFor(() => {
        expect(mockPort.postMessage).toHaveBeenCalledTimes(2);
      });

      // Second message should be error
      const errorCall = mockPort.postMessage.mock.calls[1][0];
      expect(errorCall.type).toBe('error');
      expect(errorCall.payload.code).toBe('INTERNAL_ERROR');
      expect(errorCall.payload.message).toContain('Handler failed');
    });
  });

  describe('disconnect', () => {
    it('marks bridge as disconnected on port disconnect', () => {
      expect(bridge.isConnected()).toBe(true);
      mockPort._emit('disconnect');
      expect(bridge.isConnected()).toBe(false);
    });

    it('disconnect() disconnects port', () => {
      bridge.disconnect();
      expect(bridge.isConnected()).toBe(false);
      expect(mockPort.disconnect).toHaveBeenCalled();
    });
  });

  describe('send', () => {
    it('sends message through port', () => {
      const msg = {
        id: 'msg-1',
        type: 'response' as const,
        method: 'ping',
        payload: { pong: true },
        timestamp: Date.now(),
      };
      bridge.send(msg);
      expect(mockPort.postMessage).toHaveBeenCalledWith(msg);
    });

    it('does not send when disconnected', () => {
      bridge.disconnect();
      vi.clearAllMocks();

      bridge.send({
        id: 'msg-2',
        type: 'response' as const,
        method: 'ping',
        payload: {},
        timestamp: Date.now(),
      });

      expect(mockPort.postMessage).not.toHaveBeenCalled();
    });

    it('marks as disconnected on postMessage error', () => {
      mockPort.postMessage.mockImplementation(() => {
        throw new Error('Port closed');
      });

      bridge.send({
        id: 'msg-3',
        type: 'response' as const,
        method: 'ping',
        payload: {},
        timestamp: Date.now(),
      });

      expect(bridge.isConnected()).toBe(false);
    });
  });
});
