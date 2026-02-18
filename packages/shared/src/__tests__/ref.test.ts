import { describe, it, expect } from 'vitest';
import { encodeRef, decodeRef, isValidRef, createRefCounter } from '../ref.js';

describe('encodeRef', () => {
  it('encodes index 1 as @e1', () => {
    expect(encodeRef(1)).toBe('@e1');
  });

  it('encodes large indices', () => {
    expect(encodeRef(999)).toBe('@e999');
  });

  it('throws for index 0', () => {
    expect(() => encodeRef(0)).toThrow('Ref index must be >= 1');
  });

  it('throws for negative index', () => {
    expect(() => encodeRef(-1)).toThrow('Ref index must be >= 1');
  });
});

describe('decodeRef', () => {
  it('decodes @e1 to 1', () => {
    expect(decodeRef('@e1')).toBe(1);
  });

  it('decodes @e999 to 999', () => {
    expect(decodeRef('@e999')).toBe(999);
  });

  it('returns null for invalid ref', () => {
    expect(decodeRef('invalid')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(decodeRef('')).toBeNull();
  });

  it('returns null for partial ref', () => {
    expect(decodeRef('@e')).toBeNull();
  });

  it('returns null for wrong prefix', () => {
    expect(decodeRef('@f1')).toBeNull();
  });
});

describe('isValidRef', () => {
  it('returns true for valid refs', () => {
    expect(isValidRef('@e1')).toBe(true);
    expect(isValidRef('@e42')).toBe(true);
    expect(isValidRef('@e100')).toBe(true);
  });

  it('returns false for invalid refs', () => {
    expect(isValidRef('')).toBe(false);
    expect(isValidRef('@e')).toBe(false);
    expect(isValidRef('e1')).toBe(false);
    expect(isValidRef('@f1')).toBe(false);
    expect(isValidRef('@e1x')).toBe(false);
  });
});

describe('createRefCounter', () => {
  it('generates sequential refs', () => {
    const counter = createRefCounter();
    expect(counter.next()).toBe('@e1');
    expect(counter.next()).toBe('@e2');
    expect(counter.next()).toBe('@e3');
  });

  it('tracks count', () => {
    const counter = createRefCounter();
    expect(counter.count()).toBe(0);
    counter.next();
    expect(counter.count()).toBe(1);
    counter.next();
    counter.next();
    expect(counter.count()).toBe(3);
  });
});
