#!/usr/bin/env node
/**
 * WebClaw CLI entry point.
 *
 * Usage:
 *   npx webclaw          - Start the MCP server (stdio transport)
 *   npx webclaw install  - Register Native Messaging host + output Claude Desktop config
 *   npx webclaw --help   - Show usage information
 */
import { createWebClawServer } from './server.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { install } from './installer.js';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`webclaw - WebMCP-native browser agent

Usage:
  npx webclaw              Start the MCP server (stdio transport)
  npx webclaw install      Register Native Messaging host and output Claude Desktop config
  npx webclaw --help       Show this help message

Description:
  WebClaw enables AI assistants like Claude to interact with web pages
  through a Chrome extension and MCP protocol. It supports both native
  WebMCP tools and automatic DOM-based fallback.

Claude Desktop config:
  {
    "mcpServers": {
      "webclaw": { "command": "npx", "args": ["-y", "webclaw"] }
    }
  }

More info: https://github.com/kuroko1t/hermitclaw`);
  process.exit(0);
} else if (args[0] === 'install') {
  await install();
} else {
  // Start MCP server with stdio transport
  const server = createWebClawServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[WebClaw] MCP Server started (stdio transport)');
}
