# WebClaw

[![CI](https://github.com/kuroko1t/webclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/kuroko1t/webclaw/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/webclaw-mcp)](https://www.npmjs.com/package/webclaw-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

The first **WebMCP-native** browser agent. Enables AI assistants like Claude to interact with web pages through a Chrome extension and MCP protocol.

<!-- TODO: デモGIFを撮影して docs/demo.gif に配置後、以下のコメントを外す -->
<!-- <p align="center">
  <img src="docs/demo.gif" alt="WebClaw Demo" width="720">
</p> -->

## What is WebClaw?

WebClaw bridges AI assistants and the browser using two approaches:

1. **WebMCP Native** - Discovers and invokes tools declared by websites via the W3C `navigator.modelContext` API (Chrome 146+)
2. **DOM Fallback** - Automatically synthesizes tools from forms, buttons, and inputs on any website, plus provides compact accessibility tree snapshots with `@ref` labels for precise element targeting

## Architecture

```mermaid
flowchart TB
    LLM["LLM (Claude Desktop)"]
    MCP["MCP Server (Node.js)<br/><code>packages/mcp-server</code>"]
    EXT["Chrome Extension (MV3)<br/><code>packages/extension</code>"]
    SW["Service Worker<br/>message hub"]
    SP["Side Panel<br/>agent activity log"]
    CS["Content Script<br/>(per tab)"]
    WD["WebMCP Discovery<br/>native + auto-synthesis"]
    SN["Compact Snapshot<br/>@ref A11y tree"]
    AE["Action Executor<br/>click, type, select"]

    LLM -- "MCP Protocol (stdio)" --> MCP
    MCP -- "Native Messaging<br/>(length-prefixed JSON)" --> EXT
    EXT --- SW
    EXT --- SP
    EXT --- CS
    CS --- WD
    CS --- SN
    CS --- AE

    style LLM fill:#7b2d8b,stroke:#333,color:#fff
    style MCP fill:#1a5276,stroke:#333,color:#fff
    style EXT fill:#1e8449,stroke:#333,color:#fff
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
git clone https://github.com/kuroko1t/webclaw.git
cd webclaw
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
npx webclaw-mcp install
```

This writes the Native Messaging host manifest and prints the Claude Desktop config. After running, update the `allowed_origins` in the host manifest with your extension ID.

### 4. Configure Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "webclaw": {
      "command": "npx",
      "args": ["-y", "webclaw-mcp"]
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

<!-- TODO: Side Panelのスクリーンショットを撮影して docs/sidepanel.png に配置後、以下のコメントを外す -->
<!-- <p align="center">
  <img src="docs/sidepanel.png" alt="WebClaw Side Panel" width="360">
</p> -->

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
