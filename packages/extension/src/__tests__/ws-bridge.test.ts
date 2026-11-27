import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocketBridge } from '../background/ws-bridge';
import type { MessageRouter } from '../background/message-router';

class FakeSocket {
  static OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  private listeners: Record<string, Array<(e?: unknown) => void>> = {};
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  addEventListener(type: string, fn: (e?: unknown) => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  emit(type: string) {
    if (type === 'open') this.readyState = 1;
    if (type === 'close') this.readyState = 3;
    for (const fn of this.listeners[type] ?? []) fn();
  }
  close() {
    this.emit('close');
  }
  send() {}
}

const router = {} as MessageRouter;

beforeEach(() => {
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('WebSocketBridge', () => {
  it('does not connect until connect() is called', () => {
    new WebSocketBridge('ws://127.0.0.1:1', router);
    expect(FakeSocket.instances).toHaveLength(0);
  });

  it('reports a failed attempt and a disconnect separately', () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const bridge = new WebSocketBridge('ws://127.0.0.1:1', router, { onOpen, onClose });

    bridge.connect();
    FakeSocket.instances[0].emit('error');
    FakeSocket.instances[0].emit('close');
    expect(onClose).toHaveBeenLastCalledWith(false);
    expect(onOpen).not.toHaveBeenCalled();

    bridge.connect();
    FakeSocket.instances[1].emit('open');
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(bridge.isConnected()).toBe(true);
    FakeSocket.instances[1].emit('close');
    expect(onClose).toHaveBeenLastCalledWith(true);
    expect(bridge.isConnected()).toBe(false);
  });

  it('ignores connect() while a socket is open or opening', () => {
    const bridge = new WebSocketBridge('ws://127.0.0.1:1', router);
    bridge.connect();
    bridge.connect();
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('stops reporting after disconnect()', () => {
    const onClose = vi.fn();
    const bridge = new WebSocketBridge('ws://127.0.0.1:1', router, { onClose });
    bridge.connect();
    bridge.disconnect();
    expect(onClose).not.toHaveBeenCalled();
    bridge.connect();
    expect(FakeSocket.instances).toHaveLength(1);
  });
});
