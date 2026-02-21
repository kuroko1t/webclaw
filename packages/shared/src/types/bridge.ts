/**
 * Internal message protocol between MCP Server and Chrome Extension.
 * Messages are sent via Chrome Native Messaging (32-bit length-prefixed JSON).
 */

export type BridgeMessageType = 'request' | 'response' | 'ack' | 'error';

/** Base bridge message */
export interface BridgeMessage {
  id: string;
  type: BridgeMessageType;
  method: string;
  payload: unknown;
  timestamp: number;
}

/** Request from MCP Server to Extension */
export interface BridgeRequest extends BridgeMessage {
  type: 'request';
}

/** Successful response from Extension to MCP Server */
export interface BridgeResponse extends BridgeMessage {
  type: 'response';
}

/** Acknowledgment of request receipt */
export interface BridgeAck extends BridgeMessage {
  type: 'ack';
}

/** Error response */
export interface BridgeError extends BridgeMessage {
  type: 'error';
  payload: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** All bridge method names for type-safe dispatch */
export type BridgeMethod =
  | 'navigate'
  | 'snapshot'
  | 'click'
  | 'hover'
  | 'typeText'
  | 'selectOption'
  | 'listWebMCPTools'
  | 'invokeWebMCPTool'
  | 'screenshot'
  | 'ping'
  | 'newTab'
  | 'listTabs'
  | 'switchTab'
  | 'closeTab'
  | 'goBack'
  | 'goForward'
  | 'reload'
  | 'waitForNavigation'
  | 'scrollPage'
  | 'dropFiles';

/** Chunked message for large payloads (>1MB Native Messaging limit) */
export interface ChunkedMessage {
  id: string;
  chunkIndex: number;
  totalChunks: number;
  data: string;
}
