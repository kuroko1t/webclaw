/**
 * Decides when each WebSocket bridge tries to (re)connect to its port.
 *
 * The MCP server binds the lowest free port in the range, so a new session
 * shows up on one of the lowest ports that have no connection yet. Those
 * ports are retried at the fast interval and the rest at the slow interval,
 * which keeps connecting to a new session quick without hammering every
 * unused port. When a connection opens, the next few unconnected ports are
 * tried right away: sessions often start several at a time, and waiting a
 * full fast interval per port would make the last ones slow. A port
 * whose connection just closed also gets a few fast retries, so a restarted
 * server reconnects quickly wherever it is.
 *
 * Every port is tried once right away on start(), which covers a service
 * worker restart: the new worker reconnects to all running servers at once.
 */
import {
  RECONNECT_FAST_INTERVAL_MS,
  RECONNECT_SLOW_INTERVAL_MS,
  RECONNECT_FAST_PORT_COUNT,
  RECONNECT_FAST_ATTEMPTS_AFTER_DISCONNECT,
} from 'webclaw-shared';

export interface ReconnectPolicy {
  fastIntervalMs: number;
  slowIntervalMs: number;
  /** How many of the lowest unconnected ports use the fast interval. */
  fastPortCount: number;
  /** Fast retries a port gets after its connection closes. */
  fastAttemptsAfterDisconnect: number;
}

export const DEFAULT_RECONNECT_POLICY: ReconnectPolicy = {
  fastIntervalMs: RECONNECT_FAST_INTERVAL_MS,
  slowIntervalMs: RECONNECT_SLOW_INTERVAL_MS,
  fastPortCount: RECONNECT_FAST_PORT_COUNT,
  fastAttemptsAfterDisconnect: RECONNECT_FAST_ATTEMPTS_AFTER_DISCONNECT,
};

type PortState = 'idle' | 'connecting' | 'connected';

interface Slot {
  state: PortState;
  timer: ReturnType<typeof setTimeout> | null;
  /** When the pending timer fires (only meaningful while timer is set). */
  dueAt: number;
  /** Remaining fast retries granted by a recent disconnect. */
  fastCredits: number;
}

export class ReconnectScheduler {
  private slots: Slot[];
  private stopped = false;

  /**
   * @param size number of ports, in ascending port order
   * @param attempt starts a connection attempt for the port at `index`; the
   *   caller must later report the outcome with reportOpen / reportClosed
   */
  constructor(
    size: number,
    private attempt: (index: number) => void,
    private policy: ReconnectPolicy = DEFAULT_RECONNECT_POLICY,
  ) {
    this.slots = Array.from({ length: size }, () => ({
      state: 'idle' as PortState,
      timer: null,
      dueAt: 0,
      fastCredits: 0,
    }));
  }

  /** Try every port once right away. */
  start(): void {
    for (let i = 0; i < this.slots.length; i++) this.fire(i);
  }

  /** The connection attempt for `index` succeeded. */
  reportOpen(index: number): void {
    const slot = this.slots[index];
    if (!slot || this.stopped) return;
    this.clearTimer(slot);
    slot.state = 'connected';
    slot.fastCredits = 0;
    // Sessions often start several at a time, so other servers may be
    // waiting just above this one: try twice the fast window right away.
    // (Chrome delays each attempt by up to a few seconds anyway, so trying
    // them in parallel is what keeps a burst of new sessions quick.)
    this.rebalance(0, 2 * this.policy.fastPortCount);
  }

  /**
   * The socket for `index` closed. `wasOpen` is true when it had connected
   * (a disconnect) and false when the attempt failed.
   */
  reportClosed(index: number, wasOpen: boolean): void {
    const slot = this.slots[index];
    if (!slot || this.stopped) return;
    slot.state = 'idle';
    if (wasOpen) slot.fastCredits = this.policy.fastAttemptsAfterDisconnect;
    this.schedule(index);
    if (wasOpen) this.rebalance(this.policy.fastIntervalMs, this.policy.fastPortCount);
  }

  stop(): void {
    this.stopped = true;
    for (const slot of this.slots) this.clearTimer(slot);
  }

  /** Whether the port at `index` is currently retried at the fast interval. */
  isFast(index: number): boolean {
    return this.slots[index].fastCredits > 0 || this.isLowUnconnected(index);
  }

  /** Delay until the next attempt for `index`, or null if none is pending. */
  pendingDelay(index: number, now = Date.now()): number | null {
    const slot = this.slots[index];
    return slot.timer ? Math.max(0, slot.dueAt - now) : null;
  }

  /** True when `index` is one of the `count` lowest unconnected ports. */
  private isLowUnconnected(index: number, count = this.policy.fastPortCount): boolean {
    if (this.slots[index].state === 'connected') return false;
    let lower = 0;
    for (let i = 0; i < index; i++) {
      if (this.slots[i].state !== 'connected') lower++;
    }
    return lower < count;
  }

  private schedule(index: number): void {
    const slot = this.slots[index];
    let delay: number;
    if (this.isLowUnconnected(index)) {
      delay = this.policy.fastIntervalMs;
    } else if (slot.fastCredits > 0) {
      slot.fastCredits--;
      delay = this.policy.fastIntervalMs;
    } else {
      delay = this.policy.slowIntervalMs;
    }
    this.setTimer(index, delay);
  }

  /**
   * After a connection opened or closed, bring the next attempt of each of
   * the `count` lowest unconnected ports forward to at most `maxDelay` from now.
   */
  private rebalance(maxDelay: number, count: number): void {
    const now = Date.now();
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (slot.state !== 'idle' || !slot.timer) continue;
      if (!this.isLowUnconnected(i, count)) continue;
      if (slot.dueAt - now > maxDelay) {
        this.setTimer(i, maxDelay);
      }
    }
  }

  private setTimer(index: number, delay: number): void {
    const slot = this.slots[index];
    this.clearTimer(slot);
    if (this.stopped) return;
    slot.dueAt = Date.now() + delay;
    slot.timer = setTimeout(() => {
      slot.timer = null;
      this.fire(index);
    }, delay);
  }

  private clearTimer(slot: Slot): void {
    if (slot.timer) {
      clearTimeout(slot.timer);
      slot.timer = null;
    }
  }

  private fire(index: number): void {
    const slot = this.slots[index];
    if (this.stopped || slot.state !== 'idle') return;
    slot.state = 'connecting';
    this.attempt(index);
  }
}
