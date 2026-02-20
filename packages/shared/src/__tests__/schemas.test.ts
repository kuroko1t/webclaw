import { describe, it, expect } from 'vitest';
import {
  bridgeMessageSchema,
  bridgeErrorPayloadSchema,
  chunkedMessageSchema,
  navigateToSchema,
  pageSnapshotSchema,
  clickSchema,
  typeTextSchema,
  selectOptionSchema,
  listWebMCPToolsSchema,
  invokeWebMCPToolSchema,
  screenshotSchema,
  newTabSchema,
  listTabsSchema,
  switchTabSchema,
  closeTabSchema,
  goBackSchema,
  goForwardSchema,
  reloadSchema,
  waitForNavigationSchema,
  scrollPageSchema,
} from '../schemas.js';

describe('bridgeMessageSchema', () => {
  it('accepts valid message', () => {
    const result = bridgeMessageSchema.safeParse({
      id: 'abc-123',
      type: 'request',
      method: 'ping',
      payload: {},
      timestamp: Date.now(),
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty id', () => {
    const result = bridgeMessageSchema.safeParse({
      id: '',
      type: 'request',
      method: 'ping',
      payload: {},
      timestamp: Date.now(),
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid type', () => {
    const result = bridgeMessageSchema.safeParse({
      id: 'abc',
      type: 'invalid',
      method: 'ping',
      payload: {},
      timestamp: Date.now(),
    });
    expect(result.success).toBe(false);
  });
});

describe('navigateToSchema', () => {
  it('accepts valid URL', () => {
    const result = navigateToSchema.safeParse({ url: 'https://example.com' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid URL', () => {
    const result = navigateToSchema.safeParse({ url: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('accepts optional tabId', () => {
    const result = navigateToSchema.safeParse({ url: 'https://example.com', tabId: 1 });
    expect(result.success).toBe(true);
  });
});

describe('clickSchema', () => {
  it('accepts valid ref', () => {
    const result = clickSchema.safeParse({ ref: '@e1', snapshotId: 'snap-123' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid ref format', () => {
    const result = clickSchema.safeParse({ ref: 'invalid', snapshotId: 'snap-123' });
    expect(result.success).toBe(false);
  });

  it('rejects empty snapshotId', () => {
    const result = clickSchema.safeParse({ ref: '@e1', snapshotId: '' });
    expect(result.success).toBe(false);
  });
});

describe('typeTextSchema', () => {
  it('accepts valid input', () => {
    const result = typeTextSchema.safeParse({
      ref: '@e5',
      text: 'hello',
      snapshotId: 'snap-1',
    });
    expect(result.success).toBe(true);
  });

  it('accepts clearFirst option', () => {
    const result = typeTextSchema.safeParse({
      ref: '@e5',
      text: 'hello',
      snapshotId: 'snap-1',
      clearFirst: false,
    });
    expect(result.success).toBe(true);
  });
});

describe('selectOptionSchema', () => {
  it('accepts valid input', () => {
    const result = selectOptionSchema.safeParse({
      ref: '@e3',
      value: 'option1',
      snapshotId: 'snap-1',
    });
    expect(result.success).toBe(true);
  });
});

describe('invokeWebMCPToolSchema', () => {
  it('accepts valid input', () => {
    const result = invokeWebMCPToolSchema.safeParse({
      toolName: 'add_todo',
      args: { text: 'Buy milk' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty toolName', () => {
    const result = invokeWebMCPToolSchema.safeParse({
      toolName: '',
      args: {},
    });
    expect(result.success).toBe(false);
  });
});

describe('screenshotSchema', () => {
  it('accepts empty object', () => {
    const result = screenshotSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts optional params', () => {
    const result = screenshotSchema.safeParse({ tabId: 1, fullPage: true });
    expect(result.success).toBe(true);
  });
});

describe('pageSnapshotSchema', () => {
  it('accepts empty object', () => {
    const result = pageSnapshotSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects negative maxTokens', () => {
    const result = pageSnapshotSchema.safeParse({ maxTokens: -1 });
    expect(result.success).toBe(false);
  });
});

describe('listWebMCPToolsSchema', () => {
  it('accepts empty object', () => {
    const result = listWebMCPToolsSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('chunkedMessageSchema', () => {
  it('accepts valid chunked message', () => {
    const result = chunkedMessageSchema.safeParse({
      id: 'msg-1',
      chunkIndex: 0,
      totalChunks: 3,
      data: 'base64data',
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative chunkIndex', () => {
    const result = chunkedMessageSchema.safeParse({
      id: 'msg-1',
      chunkIndex: -1,
      totalChunks: 3,
      data: 'data',
    });
    expect(result.success).toBe(false);
  });
});

describe('bridgeErrorPayloadSchema', () => {
  it('accepts valid error payload', () => {
    const result = bridgeErrorPayloadSchema.safeParse({
      code: 'NOT_FOUND',
      message: 'Page not found',
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional details', () => {
    const result = bridgeErrorPayloadSchema.safeParse({
      code: 'ERR',
      message: 'fail',
      details: { extra: true },
    });
    expect(result.success).toBe(true);
  });
});

// --- New v0.4.0 schema tests ---

describe('newTabSchema', () => {
  it('accepts empty object', () => {
    expect(newTabSchema.safeParse({}).success).toBe(true);
  });

  it('accepts optional url', () => {
    expect(newTabSchema.safeParse({ url: 'https://example.com' }).success).toBe(true);
  });

  it('rejects invalid url', () => {
    expect(newTabSchema.safeParse({ url: 'not-a-url' }).success).toBe(false);
  });
});

describe('listTabsSchema', () => {
  it('accepts empty object', () => {
    expect(listTabsSchema.safeParse({}).success).toBe(true);
  });
});

describe('switchTabSchema', () => {
  it('accepts valid tabId', () => {
    expect(switchTabSchema.safeParse({ tabId: 1 }).success).toBe(true);
  });

  it('rejects missing tabId', () => {
    expect(switchTabSchema.safeParse({}).success).toBe(false);
  });
});

describe('closeTabSchema', () => {
  it('accepts valid tabId', () => {
    expect(closeTabSchema.safeParse({ tabId: 5 }).success).toBe(true);
  });

  it('rejects missing tabId', () => {
    expect(closeTabSchema.safeParse({}).success).toBe(false);
  });
});

describe('goBackSchema', () => {
  it('accepts empty object', () => {
    expect(goBackSchema.safeParse({}).success).toBe(true);
  });

  it('accepts optional tabId', () => {
    expect(goBackSchema.safeParse({ tabId: 2 }).success).toBe(true);
  });
});

describe('goForwardSchema', () => {
  it('accepts empty object', () => {
    expect(goForwardSchema.safeParse({}).success).toBe(true);
  });

  it('accepts optional tabId', () => {
    expect(goForwardSchema.safeParse({ tabId: 3 }).success).toBe(true);
  });
});

describe('reloadSchema', () => {
  it('accepts empty object', () => {
    expect(reloadSchema.safeParse({}).success).toBe(true);
  });

  it('accepts optional params', () => {
    expect(reloadSchema.safeParse({ tabId: 1, bypassCache: true }).success).toBe(true);
  });
});

describe('waitForNavigationSchema', () => {
  it('accepts empty object', () => {
    expect(waitForNavigationSchema.safeParse({}).success).toBe(true);
  });

  it('accepts optional params', () => {
    expect(waitForNavigationSchema.safeParse({ tabId: 1, timeoutMs: 5000 }).success).toBe(true);
  });

  it('rejects non-positive timeoutMs', () => {
    expect(waitForNavigationSchema.safeParse({ timeoutMs: 0 }).success).toBe(false);
    expect(waitForNavigationSchema.safeParse({ timeoutMs: -1 }).success).toBe(false);
  });
});

describe('scrollPageSchema', () => {
  it('accepts empty object', () => {
    expect(scrollPageSchema.safeParse({}).success).toBe(true);
  });

  it('accepts direction and amount', () => {
    expect(scrollPageSchema.safeParse({ direction: 'down', amount: 500 }).success).toBe(true);
    expect(scrollPageSchema.safeParse({ direction: 'up', amount: 200 }).success).toBe(true);
  });

  it('accepts ref with snapshotId', () => {
    expect(scrollPageSchema.safeParse({ ref: '@e5', snapshotId: 'snap-1' }).success).toBe(true);
  });

  it('rejects invalid ref format', () => {
    expect(scrollPageSchema.safeParse({ ref: 'bad' }).success).toBe(false);
  });

  it('rejects invalid direction', () => {
    expect(scrollPageSchema.safeParse({ direction: 'left' }).success).toBe(false);
  });
});
