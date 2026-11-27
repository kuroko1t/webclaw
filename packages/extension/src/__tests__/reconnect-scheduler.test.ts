import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  RECONNECT_FAST_INTERVAL_MS,
  RECONNECT_SLOW_INTERVAL_MS,
  RECONNECT_FAST_PORT_COUNT,
  RECONNECT_FAST_ATTEMPTS_AFTER_DISCONNECT,
  WEBSOCKET_PORT_RANGE_SIZE,
} from 'webclaw-shared';
import { ReconnectScheduler } from '../background/reconnect-scheduler';

const FAST = RECONNECT_FAST_INTERVAL_MS;
const SLOW = RECONNECT_SLOW_INTERVAL_MS;
const SIZE = WEBSOCKET_PORT_RANGE_SIZE;

/**
 * A fake set of servers. An attempt on a listening index opens at once,
 * any other attempt fails at once.
 */
function setup(size = SIZE) {
  const listening = new Set<number>();
  const attempts: number[][] = Array.from({ length: size }, () => []);
  const scheduler = new ReconnectScheduler(size, (i) => {
    attempts[i].push(Date.now());
    if (listening.has(i)) scheduler.reportOpen(i);
    else scheduler.reportClosed(i, false);
  });
  const total = () => attempts.reduce((n, a) => n + a.length, 0);
  /** Server at `i` goes away while connected. */
  const drop = (i: number) => {
    listening.delete(i);
    scheduler.reportClosed(i, true);
  };
  return { scheduler, listening, attempts, total, drop };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ReconnectScheduler', () => {
  it('uses the planned constants', () => {
    expect(SIZE).toBe(30);
    expect(FAST).toBe(3_000);
    expect(SLOW).toBe(30_000);
    expect(RECONNECT_FAST_PORT_COUNT).toBe(3);
    expect(RECONNECT_FAST_ATTEMPTS_AFTER_DISCONNECT).toBe(5);
  });

  it('tries every port once on start', () => {
    const { scheduler, attempts } = setup();
    scheduler.start();
    expect(attempts.every((a) => a.length === 1)).toBe(true);
  });

  it('retries the lowest unconnected ports fast and the rest slowly', () => {
    const { scheduler } = setup();
    scheduler.start();
    for (let i = 0; i < SIZE; i++) {
      const fast = i < RECONNECT_FAST_PORT_COUNT;
      expect(scheduler.isFast(i)).toBe(fast);
      expect(scheduler.pendingDelay(i)).toBe(fast ? FAST : SLOW);
    }
  });

  it('bounds the attempts with no server running', () => {
    const { scheduler, total, attempts } = setup();
    scheduler.start();
    vi.advanceTimersByTime(60_000);
    // 30 on start, then 3 ports x 20 fast attempts and 27 ports x 2 slow ones.
    const expected =
      SIZE +
      RECONNECT_FAST_PORT_COUNT * (60_000 / FAST) +
      (SIZE - RECONNECT_FAST_PORT_COUNT) * (60_000 / SLOW);
    expect(total()).toBe(expected);
    expect(expected).toBe(144);
    expect(attempts[0]).toHaveLength(21);
    expect(attempts[SIZE - 1]).toHaveLength(3);

    // Steady state: under 2 attempts per second (was 10 with every port at 3s).
    const before = total();
    vi.advanceTimersByTime(600_000);
    const perSecond = (total() - before) / 600;
    expect(perSecond).toBeCloseTo(1.9, 5);
  });

  it('moves the fast window up past connected ports', () => {
    const { scheduler, listening, total } = setup();
    for (let i = 0; i < 12; i++) listening.add(i);
    scheduler.start();
    for (let i = 0; i < 12; i++) {
      expect(scheduler.isFast(i)).toBe(false);
      expect(scheduler.pendingDelay(i)).toBeNull();
    }
    expect([12, 13, 14].map((i) => scheduler.isFast(i))).toEqual([true, true, true]);
    expect(scheduler.isFast(15)).toBe(false);

    const before = total();
    vi.advanceTimersByTime(600_000);
    // 3 fast ports at 1/3 per second plus 15 slow ports at 1/30 per second.
    expect((total() - before) / 600).toBeCloseTo(1 + 15 / 30, 1);
  });

  it('connects a new server on the next fast port within the fast interval', () => {
    const { scheduler, listening, attempts } = setup();
    for (let i = 0; i < 5; i++) listening.add(i);
    scheduler.start();
    vi.advanceTimersByTime(1_000);

    listening.add(5); // a new session binds the lowest free port
    const connectedBefore = attempts[5].length;
    vi.advanceTimersByTime(FAST);
    expect(attempts[5].length).toBe(connectedBefore + 1);
    expect(scheduler.pendingDelay(5)).toBeNull(); // connected
    // Port 8 (was the 4th unconnected) is now on the fast side.
    expect(scheduler.isFast(8)).toBe(true);
  });

  it('brings a slow port forward when it enters the fast window', () => {
    const { scheduler, listening } = setup();
    scheduler.start();
    expect(scheduler.pendingDelay(3)).toBe(SLOW);

    vi.advanceTimersByTime(1_000);
    listening.add(0);
    vi.advanceTimersByTime(FAST - 1_000); // port 0 retries and connects
    expect(scheduler.isFast(3)).toBe(true);
    expect(scheduler.pendingDelay(3)).toBeLessThanOrEqual(FAST);
  });

  it('tries the fast ports right away after a connection opens', () => {
    const { scheduler, listening } = setup();
    scheduler.start();
    vi.advanceTimersByTime(1_000);
    listening.add(0);
    vi.advanceTimersByTime(FAST - 1_000); // ports 0-2 retry, port 0 connects
    // Ports 1-2 have just retried; the rest of the next six unconnected
    // ports (3-6) are tried at once, the others keep their slow timer.
    for (let i = 1; i < RECONNECT_FAST_PORT_COUNT; i++) {
      expect(scheduler.pendingDelay(i)).toBe(FAST);
    }
    for (let i = RECONNECT_FAST_PORT_COUNT; i <= 2 * RECONNECT_FAST_PORT_COUNT; i++) {
      expect(scheduler.pendingDelay(i)).toBe(0);
    }
    expect(scheduler.pendingDelay(2 * RECONNECT_FAST_PORT_COUNT + 1)).toBe(SLOW - FAST);
    // Only ports 1-3 stay on the fast side afterwards.
    vi.advanceTimersByTime(1);
    expect(scheduler.pendingDelay(3)).toBe(FAST);
    expect(scheduler.pendingDelay(4)).toBe(SLOW);
  });

  it('bounds the extra attempts a connection triggers', () => {
    const { scheduler, listening, total } = setup();
    scheduler.start();
    vi.advanceTimersByTime(1_000);
    listening.add(0);
    const before = total();
    vi.advanceTimersByTime(FAST - 1_000); // ports 0-2 retry, port 0 connects
    vi.advanceTimersByTime(1);
    // 3 scheduled retries plus at most 2 x 3 immediate ones.
    expect(total() - before).toBeLessThanOrEqual(3 + 2 * RECONNECT_FAST_PORT_COUNT);
  });

  it('connects a burst of servers without one fast interval per port', () => {
    const { scheduler, listening } = setup();
    scheduler.start();
    vi.advanceTimersByTime(1_000);
    for (let i = 0; i < 12; i++) listening.add(i); // 12 sessions start at once
    vi.advanceTimersByTime(FAST); // ports 0-2 retry; each connection pulls the next one in
    for (let i = 0; i < 12; i++) expect(scheduler.pendingDelay(i)).toBeNull();
    expect(scheduler.isFast(12)).toBe(true);
  });

  it('retries a disconnected high port fast for a few attempts, then slowly', () => {
    const { scheduler, listening, attempts, drop } = setup();
    listening.add(25);
    scheduler.start();
    expect(scheduler.pendingDelay(25)).toBeNull();

    drop(25);
    expect(scheduler.isFast(25)).toBe(true);
    expect(scheduler.pendingDelay(25)).toBe(FAST);

    vi.advanceTimersByTime(FAST * RECONNECT_FAST_ATTEMPTS_AFTER_DISCONNECT);
    expect(attempts[25]).toHaveLength(1 + RECONNECT_FAST_ATTEMPTS_AFTER_DISCONNECT);
    expect(scheduler.isFast(25)).toBe(false);
    expect(scheduler.pendingDelay(25)).toBe(SLOW);
  });

  it('reconnects a server restarted on the same port within the fast interval', () => {
    const { scheduler, listening, attempts, drop } = setup();
    listening.add(20);
    scheduler.start();
    drop(20);
    vi.advanceTimersByTime(5_000);
    listening.add(20);
    vi.advanceTimersByTime(FAST);
    expect(scheduler.pendingDelay(20)).toBeNull();
    const last = attempts[20][attempts[20].length - 1];
    expect(last).toBeLessThanOrEqual(5_000 + FAST);
  });

  it('puts a lower port that disconnects back on the fast side', () => {
    const { scheduler, listening, drop } = setup();
    for (let i = 0; i < 10; i++) listening.add(i);
    scheduler.start();
    drop(4);
    expect(scheduler.isFast(4)).toBe(true);
    expect(scheduler.pendingDelay(4)).toBe(FAST);
  });

  it('reaches a server on a slow port within the slow interval', () => {
    const { scheduler, listening } = setup();
    scheduler.start();
    vi.advanceTimersByTime(1);
    listening.add(SIZE - 1); // e.g. WEBCLAW_PORT set to the top of the range
    vi.advanceTimersByTime(SLOW - 1);
    expect(scheduler.pendingDelay(SIZE - 1)).toBeNull();
  });

  it('restarts cleanly: a new scheduler tries all ports at once', () => {
    const first = setup();
    first.scheduler.start();
    vi.advanceTimersByTime(10_000);
    first.scheduler.stop();
    const stoppedAt = first.total();
    vi.advanceTimersByTime(60_000);
    expect(first.total()).toBe(stoppedAt);

    const second = setup();
    second.listening.add(SIZE - 1);
    second.scheduler.start();
    expect(second.scheduler.pendingDelay(SIZE - 1)).toBeNull();
  });

  it('does not start a second attempt while one is in flight', () => {
    const calls: number[] = [];
    const scheduler = new ReconnectScheduler(3, (i) => calls.push(i));
    scheduler.start();
    vi.advanceTimersByTime(60_000);
    expect(calls).toEqual([0, 1, 2]);
    scheduler.reportClosed(1, false);
    vi.advanceTimersByTime(FAST);
    expect(calls).toEqual([0, 1, 2, 1]);
  });
});
