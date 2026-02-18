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
