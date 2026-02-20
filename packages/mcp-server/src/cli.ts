#!/usr/bin/env node
/**
 * WebClaw CLI entry point.
 *
 * Usage:
 *   npx webclaw-mcp          - Start the MCP server (stdio transport + WebSocket)
 *   npx webclaw-mcp install  - Output Claude Desktop config
 *   npx webclaw-mcp --help   - Show usage information
 */
import { createWebClawServer } from './server.js';
import { WebSocketClient } from './ws-client.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { install } from './installer.js';
import { WEBSOCKET_DEFAULT_PORT, WEBSOCKET_PORT_ENV } from 'webclaw-shared';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`webclaw-mcp - WebMCP-native browser agent

Usage:
  npx webclaw-mcp              Start the MCP server (stdio + WebSocket)
  npx webclaw-mcp install      Output Claude Desktop config
  npx webclaw-mcp --help       Show this help message

Description:
  WebClaw enables AI assistants like Claude to interact with web pages
  through a Chrome extension and MCP protocol. The MCP server communicates
  with the Chrome extension via a localhost WebSocket connection.

Environment variables:
  ${WEBSOCKET_PORT_ENV}    WebSocket port (default: ${WEBSOCKET_DEFAULT_PORT})

Claude Desktop config:
  {
    "mcpServers": {
      "webclaw": { "command": "npx", "args": ["-y", "webclaw-mcp"] }
    }
  }

More info: https://github.com/kuroko1t/webclaw`);
  process.exit(0);
} else if (args[0] === 'install') {
  await install();
} else {
  const port = Number(process.env[WEBSOCKET_PORT_ENV]) || WEBSOCKET_DEFAULT_PORT;
  const wsClient = await WebSocketClient.create(port);
  console.error(`[WebClaw] WebSocket server listening on 127.0.0.1:${port}`);

  const server = createWebClawServer({ wsClient });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[WebClaw] MCP Server started (stdio transport)`);
}
