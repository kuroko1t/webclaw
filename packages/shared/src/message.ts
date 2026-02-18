/**
 * Message construction utilities.
 */
import type {
  BridgeMessage,
  BridgeRequest,
  BridgeResponse,
  BridgeError,
  BridgeMethod,
} from './types/bridge.js';

/** Create a unique message ID */
export function createMessageId(): string {
  // Use globalThis.crypto.randomUUID (available in Node 19+ and modern browsers)
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Create a bridge request message */
export function createRequest(
  method: BridgeMethod,
  payload: unknown = {}
): BridgeRequest {
  return {
    id: createMessageId(),
    type: 'request',
    method,
    payload,
    timestamp: Date.now(),
  };
}

/** Create a bridge response message */
export function createResponse(
  requestId: string,
  method: string,
  payload: unknown = {}
): BridgeResponse {
  return {
    id: requestId,
    type: 'response',
    method,
    payload,
    timestamp: Date.now(),
  };
}

/** Create a bridge error message */
export function createError(
  requestId: string,
  method: string,
  code: string,
  message: string,
  details?: unknown
): BridgeError {
  return {
    id: requestId,
    type: 'error',
    method,
    payload: { code, message, details },
    timestamp: Date.now(),
  };
}

/** Type guard for bridge messages */
export function isBridgeMessage(obj: unknown): obj is BridgeMessage {
  if (typeof obj !== 'object' || obj === null) return false;
  const msg = obj as Record<string, unknown>;
  return (
    typeof msg.id === 'string' &&
    typeof msg.type === 'string' &&
    typeof msg.method === 'string' &&
    typeof msg.timestamp === 'number'
  );
}
