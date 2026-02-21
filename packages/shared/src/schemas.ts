/**
 * Zod schemas for message validation.
 */
import { z } from 'zod';

// Bridge message schemas
export const bridgeMessageSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['request', 'response', 'ack', 'error']),
  method: z.string().min(1),
  payload: z.unknown(),
  timestamp: z.number(),
});

export const bridgeErrorPayloadSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export const chunkedMessageSchema = z.object({
  id: z.string().min(1),
  chunkIndex: z.number().int().min(0),
  totalChunks: z.number().int().min(1),
  data: z.string(),
});

// MCP tool parameter schemas
export const navigateToSchema = z.object({
  url: z.string().url(),
  tabId: z.number().int().optional(),
});

export const pageSnapshotSchema = z.object({
  tabId: z.number().int().optional(),
  maxTokens: z.number().int().positive().optional(),
  focusRegion: z.string().optional(),
});

export const clickSchema = z.object({
  ref: z.string().regex(/^@e\d+$/),
  snapshotId: z.string().min(1),
  tabId: z.number().int().optional(),
});

export const typeTextSchema = z.object({
  ref: z.string().regex(/^@e\d+$/),
  text: z.string(),
  snapshotId: z.string().min(1),
  clearFirst: z.boolean().optional(),
  tabId: z.number().int().optional(),
});

export const selectOptionSchema = z.object({
  ref: z.string().regex(/^@e\d+$/),
  value: z.string(),
  snapshotId: z.string().min(1),
  tabId: z.number().int().optional(),
});

export const listWebMCPToolsSchema = z.object({
  tabId: z.number().int().optional(),
});

export const invokeWebMCPToolSchema = z.object({
  toolName: z.string().min(1),
  args: z.record(z.unknown()),
  tabId: z.number().int().optional(),
});

export const screenshotSchema = z.object({
  tabId: z.number().int().optional(),
  fullPage: z.boolean().optional(),
});

// --- New v0.4.0 schemas ---

export const newTabSchema = z.object({
  url: z.string().url().optional(),
});

export const listTabsSchema = z.object({});

export const switchTabSchema = z.object({
  tabId: z.number().int(),
});

export const closeTabSchema = z.object({
  tabId: z.number().int(),
});

export const goBackSchema = z.object({
  tabId: z.number().int().optional(),
});

export const goForwardSchema = z.object({
  tabId: z.number().int().optional(),
});

export const reloadSchema = z.object({
  tabId: z.number().int().optional(),
  bypassCache: z.boolean().optional(),
});

export const waitForNavigationSchema = z.object({
  tabId: z.number().int().optional(),
  timeoutMs: z.number().int().positive().optional(),
});

export const scrollPageSchema = z.object({
  tabId: z.number().int().optional(),
  direction: z.enum(['up', 'down']).optional(),
  amount: z.number().int().positive().optional(),
  ref: z.string().regex(/^@e\d+$/).optional(),
  snapshotId: z.string().min(1).optional(),
});

export const dropFileEntrySchema = z.object({
  name: z.string().min(1),
  mimeType: z.string().min(1),
  base64Data: z.string().min(1).optional(),
  filePath: z.string().min(1).optional(),
}).refine(
  (data) => data.base64Data !== undefined || data.filePath !== undefined,
  { message: 'Either base64Data or filePath must be provided' }
);

export const dropFilesSchema = z.object({
  ref: z.string().regex(/^@e\d+$/),
  snapshotId: z.string().min(1),
  files: z.array(dropFileEntrySchema).min(1),
  tabId: z.number().int().optional(),
});
