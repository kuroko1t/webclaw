# WebClaw

The first WebMCP-native browser agent. Enables AI assistants like Claude to interact with web pages through a Chrome extension and MCP protocol.

## What is WebClaw?

WebClaw bridges AI assistants and the browser using two approaches:

1. **WebMCP Native** - Discovers and invokes tools declared by websites via the W3C `navigator.modelContext` API (Chrome 146+)
2. **DOM Fallback** - Automatically synthesizes tools from forms, buttons, and inputs on any website, plus provides compact accessibility tree snapshots with `@ref` labels for precise element targeting

## Architecture

```
LLM (Claude Desktop)
        |
   MCP Protocol (stdio)
        |
  MCP Server (Node.js)        <- packages/mcp-server
        |
  Native Messaging (stdio, 32-bit length-prefixed JSON)
        |
  Chrome Extension (MV3)      <- packages/extension
   ├── Service Worker (message hub)
   ├── Side Panel (agent activity log)
   └── Content Script (per tab)
        ├── WebMCP Discovery (native + auto-synthesis)
        ├── Compact Snapshot (@ref A11y tree)
        └── Action Executor (click, type, select)
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `navigate_to` | Navigate to a URL |
| `page_snapshot` | Get compact @ref accessibility tree |
| `click` | Click element by @ref |
| `type_text` | Type into input by @ref |
| `select_option` | Select dropdown option by @ref |
| `list_webmcp_tools` | List page's WebMCP tools |
| `invoke_webmcp_tool` | Call a WebMCP tool |
| `screenshot` | Capture visible tab |

## Setup

### Prerequisites

- Node.js 20+
- pnpm 9+
- Google Chrome 120+ (Chrome 146+ for native WebMCP)

### 1. Build

```bash
git clone https://github.com/kuroko1t/hermitclaw.git
cd hermitclaw
pnpm install
pnpm build
```

### 2. Load Chrome Extension

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `packages/extension/dist/`
5. Note the extension ID shown on the card

### 3. Register Native Messaging Host

```bash
npx webclaw install
```

This writes the Native Messaging host manifest and prints the Claude Desktop config. After running, update the `allowed_origins` in the host manifest with your extension ID.

### 4. Configure Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "webclaw": {
      "command": "npx",
      "args": ["-y", "webclaw"]
    }
  }
}
```

Config file locations:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%/Claude/claude_desktop_config.json`

### 5. Verify

Restart Claude Desktop. Ask it to navigate to a website - you should see activity in the extension's Side Panel.

## Usage Example

In Claude Desktop:

> "Go to google.com and search for WebMCP"

Claude will:
1. `navigate_to("https://www.google.com")`
2. `page_snapshot()` - get the @ref tree
3. `click @e4` - focus search box
4. `type_text @e4 "WebMCP"` - type query
5. `click @e5` - click search button

The Side Panel shows all tool calls in real-time.

## Demo Site

A WebMCP-enabled Todo app is included for testing native tool discovery:

```bash
cd examples/webmcp-demo-site
npx serve .
```

Open `http://localhost:3000` in Chrome, then ask Claude to interact with the todo list. It will discover the native `add_todo`, `toggle_todo`, `delete_todo`, and `list_todos` tools via WebMCP.

## Development

```bash
pnpm install
pnpm build        # Build all packages
pnpm test         # Run all tests
pnpm dev          # Watch mode
```

### Project Structure

```
packages/
  shared/          Type definitions, Zod schemas, utilities
  mcp-server/      MCP server with 8 tools, Native Messaging bridge
  extension/       Chrome MV3 extension (service worker, content scripts, side panel)
examples/
  webmcp-demo-site/  WebMCP-enabled Todo app for testing
```

## How It Differs from Alternatives

| | WebClaw | browser-use | Playwright MCP |
|---|---|---|---|
| WebMCP native | Yes | No | No |
| Uses real browser | Yes (extension) | No (CDP) | No (Playwright) |
| Bot detection | Resistant | Vulnerable | Vulnerable |
| User's session | Yes | No | No |
| Page snapshots | @ref A11y tree | Screenshots | DOM/Screenshots |

## License

MIT
