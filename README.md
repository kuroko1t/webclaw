# WebClaw

[![CI](https://github.com/kuroko1t/webclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/kuroko1t/webclaw/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/webclaw-mcp)](https://www.npmjs.com/package/webclaw-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

The first **WebMCP-native** browser agent. Enables AI assistants like Claude to interact with web pages through a Chrome extension and MCP server.

## What is WebClaw?

WebClaw bridges AI assistants and the browser using two approaches:

1. **WebMCP Native** - Discovers and invokes tools declared by websites via the W3C `navigator.modelContext` API (Chrome 146+)
2. **DOM Fallback** - Automatically synthesizes tools from forms, buttons, and inputs on any website, plus provides compact accessibility tree snapshots with `@ref` labels for precise element targeting

Unlike CDP-based alternatives (browser-use, Playwright MCP), WebClaw runs inside a **real Chrome extension** — meaning it has access to the user's logged-in sessions, cookies, and installed extensions, and is **resistant to bot detection**.

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
    MCP -- "WebSocket<br/>(localhost:18080)" --> EXT
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

| Tool | Parameters | Description |
|------|-----------|-------------|
| `navigate_to` | `url` | Navigate to a URL in the active tab |
| `page_snapshot` | `maxTokens?` | Get a compact accessibility tree with `@ref` labels |
| `click` | `ref` | Click an element by its `@ref` label |
| `type_text` | `ref`, `text` | Type text into an input/textarea by `@ref` |
| `select_option` | `ref`, `value` | Select a dropdown option by `@ref` |
| `list_webmcp_tools` | | List WebMCP tools declared by the page |
| `invoke_webmcp_tool` | `toolName`, `args?` | Call a WebMCP tool on the page |
| `screenshot` | | Capture the visible area of the active tab |

## Quick Start

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
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `packages/extension/dist/`

### 3. Configure your MCP Client

<details>
<summary><b>Claude Desktop</b></summary>

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
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

</details>

<details>
<summary><b>Claude Code</b></summary>

```bash
claude mcp add webclaw -- npx -y webclaw-mcp
```

</details>

<details>
<summary><b>Cursor</b></summary>

Add to `.cursor/mcp.json` in your project root:

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

</details>

<details>
<summary><b>VS Code (Copilot)</b></summary>

Add to `.vscode/mcp.json` in your project root:

```json
{
  "servers": {
    "webclaw": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "webclaw-mcp"]
    }
  }
}
```

</details>

<details>
<summary><b>Windsurf</b></summary>

Add to `~/.codeium/windsurf/mcp_config.json`:

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

</details>

### 4. Verify

Restart your MCP client. Make sure Chrome is running with the extension loaded. Ask the AI to navigate to a website — you should see activity in the extension's Side Panel.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WEBCLAW_PORT` | `18080` | WebSocket port for MCP server ↔ extension communication |

## Usage Example

In Claude Desktop:

> "Go to google.com and search for WebMCP"

Claude will:
1. `navigate_to("https://www.google.com")`
2. `page_snapshot()` — get the `@ref` tree
3. `click @e4` — focus search box
4. `type_text @e4 "WebMCP"` — type query
5. `click @e5` — click search button

The Side Panel shows all tool calls in real-time.

## Demo Site

A WebMCP-enabled Todo app is included for testing native tool discovery:

```bash
cd examples/webmcp-demo-site
npx serve .
```

Open `http://localhost:3000` in Chrome, then ask Claude to interact with the todo list. It will discover the native `add_todo`, `toggle_todo`, `delete_todo`, and `list_todos` tools via WebMCP.

## How It Differs from Alternatives

| | WebClaw | browser-use | Playwright MCP |
|---|---|---|---|
| WebMCP native | Yes | No | No |
| Uses real browser | Yes (extension) | No (CDP) | No (Playwright) |
| Bot detection | Resistant | Vulnerable | Vulnerable |
| User's session | Yes | No | No |
| Page snapshots | `@ref` A11y tree | Screenshots | DOM/Screenshots |

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
  mcp-server/      MCP server with 8 tools, WebSocket bridge
  extension/       Chrome MV3 extension (service worker, content scripts, side panel)
examples/
  webmcp-demo-site/  WebMCP-enabled Todo app for testing
```

## Troubleshooting

**Chrome extension not connected**
- Make sure Chrome is running with the extension loaded
- Check the Service Worker console (`chrome://extensions/` → Details → Service Worker) for `Connected to MCP server`
- Verify the MCP server is running (look for `WebSocket server listening on 127.0.0.1:18080` in stderr)

**MCP client cannot connect**
- Ensure `npx webclaw-mcp` runs successfully from your terminal
- Check for port conflicts on 18080 (override with `WEBCLAW_PORT` env var)
- Restart your MCP client after updating the config

**Content script not injecting**
- Content scripts only inject into `http://` and `https://` pages (not `chrome://`, `file://`, etc.)
- Try refreshing the page after loading the extension

**WebMCP tools not discovered**
- Native WebMCP requires Chrome 146+ with the `navigator.modelContext` API
- Verify the page declares tools via `navigator.modelContext.addTool()` or `<link rel="webmcp-manifest">`

## Contributing

Contributions are welcome! Please open an issue to discuss your idea before submitting a pull request.

```bash
git clone https://github.com/kuroko1t/webclaw.git
cd webclaw
pnpm install
pnpm build
pnpm test         # Run all tests before submitting
```

## License

[MIT](LICENSE)
