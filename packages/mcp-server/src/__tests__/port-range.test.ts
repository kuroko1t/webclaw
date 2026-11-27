import { describe, it, expect } from 'vitest';
import {
  WEBSOCKET_DEFAULT_PORT,
  WEBSOCKET_PORT_RANGE_SIZE,
  RECONNECT_SLOW_INTERVAL_MS,
} from 'webclaw-shared';
import { preLaunchWaitMs, widePortRangeNote } from '../port-range.js';

// Pure functions of a port number: nothing listens on these ports here.
describe('widePortRangeNote', () => {
  it('covers 30 ports from 18080', () => {
    expect(WEBSOCKET_DEFAULT_PORT).toBe(18080);
    expect(WEBSOCKET_PORT_RANGE_SIZE).toBe(30);
  });

  it('is null for the ports every extension connects to', () => {
    for (let p = 18080; p <= 18089; p++) expect(widePortRangeNote(p)).toBeNull();
  });

  it('names the extension version for ports 18090–18109', () => {
    for (const p of [18090, 18100, 18109]) {
      const note = widePortRangeNote(p);
      expect(note).toContain(`Port ${p}`);
      expect(note).toContain('18080–18089');
      expect(note).toContain('v0.11.0 or later');
    }
  });

  it('is null outside the range', () => {
    expect(widePortRangeNote(18110)).toBeNull();
    expect(widePortRangeNote(19070)).toBeNull();
    expect(widePortRangeNote(18079)).toBeNull();
  });
});

describe('preLaunchWaitMs', () => {
  it('launches right away for scanned ports', () => {
    for (const p of [18080, 18090, 18109]) expect(preLaunchWaitMs(p, false)).toBe(0);
  });

  it('launches right away for explicit ports on the fast side or outside the range', () => {
    for (const p of [18080, 18081, 18082, 18110, 19070]) expect(preLaunchWaitMs(p, true)).toBe(0);
  });

  it('waits one slow retry interval plus margin for other explicit ports', () => {
    for (const p of [18083, 18095, 18109]) {
      const ms = preLaunchWaitMs(p, true);
      expect(ms).toBeGreaterThan(RECONNECT_SLOW_INTERVAL_MS);
      expect(ms).toBe(40_000);
    }
  });
});
