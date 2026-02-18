import { describe, it, expect } from 'vitest';
import {
  createMessageId,
  createRequest,
  createResponse,
  createError,
  isBridgeMessage,
} from '../message.js';

describe('createMessageId', () => {
  it('returns a non-empty string', () => {
    const id = createMessageId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('returns unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => createMessageId()));
    expect(ids.size).toBe(100);
  });
});

describe('createRequest', () => {
  it('creates a request with correct type', () => {
    const req = createRequest('ping');
    expect(req.type).toBe('request');
    expect(req.method).toBe('ping');
    expect(req.id).toBeTruthy();
    expect(req.timestamp).toBeGreaterThan(0);
  });

  it('includes payload', () => {
    const req = createRequest('navigate', { url: 'https://example.com' });
    expect(req.payload).toEqual({ url: 'https://example.com' });
  });

  it('defaults payload to empty object', () => {
    const req = createRequest('ping');
    expect(req.payload).toEqual({});
  });
});

describe('createResponse', () => {
  it('creates a response with correct type', () => {
    const res = createResponse('req-123', 'ping', { pong: true });
    expect(res.type).toBe('response');
    expect(res.id).toBe('req-123');
    expect(res.method).toBe('ping');
    expect(res.payload).toEqual({ pong: true });
  });
});

describe('createError', () => {
  it('creates an error with correct structure', () => {
    const err = createError('req-123', 'navigate', 'NOT_FOUND', 'Page not found');
    expect(err.type).toBe('error');
    expect(err.id).toBe('req-123');
    expect(err.method).toBe('navigate');
    expect(err.payload).toEqual({
      code: 'NOT_FOUND',
      message: 'Page not found',
      details: undefined,
    });
  });

  it('includes details when provided', () => {
    const err = createError('req-123', 'navigate', 'ERR', 'fail', { extra: true });
    expect(err.payload.details).toEqual({ extra: true });
  });
});

describe('isBridgeMessage', () => {
  it('returns true for valid bridge messages', () => {
    expect(
      isBridgeMessage({
        id: 'abc',
        type: 'request',
        method: 'ping',
        payload: {},
        timestamp: 123,
      })
    ).toBe(true);
  });

  it('returns false for null', () => {
    expect(isBridgeMessage(null)).toBe(false);
  });

  it('returns false for non-object', () => {
    expect(isBridgeMessage('string')).toBe(false);
    expect(isBridgeMessage(42)).toBe(false);
  });

  it('returns false for missing fields', () => {
    expect(isBridgeMessage({ id: 'abc' })).toBe(false);
    expect(isBridgeMessage({ id: 'abc', type: 'request' })).toBe(false);
    expect(isBridgeMessage({ id: 'abc', type: 'request', method: 'ping' })).toBe(false);
  });

  it('returns false for wrong field types', () => {
    expect(
      isBridgeMessage({ id: 123, type: 'request', method: 'ping', timestamp: 0 })
    ).toBe(false);
  });
});
