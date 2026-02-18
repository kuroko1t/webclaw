#!/usr/bin/env node
/**
 * WebClaw CLI entry point.
 *
 * Usage:
 *   npx webclaw          - Start the MCP server (stdio transport)
 *   npx webclaw install  - Register Native Messaging host + output Claude Desktop config
 */
import { createWebClawServer } from './server.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { install } from './installer.js';

const args = process.argv.slice(2);

if (args[0] === 'install') {
  await install();
} else {
  // Start MCP server with stdio transport
  const server = createWebClawServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[WebClaw] MCP Server started (stdio transport)');
}
