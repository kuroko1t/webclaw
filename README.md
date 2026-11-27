# WebClaw

[![CI](https://github.com/kuroko1t/webclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/kuroko1t/webclaw/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/webclaw-mcp)](https://www.npmjs.com/package/webclaw-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A **WebMCP-native** browser agent that runs inside your real Chrome — control it from Claude, Cursor, and any MCP client.

<p align="center">
  <img src="docs/images/demo.gif" alt="WebClaw demo" width="860">
</p>

## Why WebClaw?

|  | WebClaw | browser-use | Playwright MCP |
|---|---|---|---|
| Runs in real Chrome | **Yes** (extension) | No (CDP) | No (Playwright) |
| User's logged-in sessions | **Yes** | No | No |
| Bot detection | **Resistant** | Vulnerable | Vulnerable |
| WebMCP native tools | **Yes** | No | No |
| Page understanding | `@ref` a11y tree | Screenshots | DOM / Screenshots |

WebClaw runs as a **Chrome extension**, so it sees exactly what you see — cookies, logins, extensions, and all. No headless browser, no CDP injection, no bot flags.

## Quick Start

### 1. Configure your MCP client

<details open>
<summary><b>Claude Desktop</b></summary>

Add to `claude_desktop_config.json`:

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

### 2. Load the Chrome extension

1. Download the latest `webclaw-extension-vX.Y.Z.zip` from the [Releases page](https://github.com/kuroko1t/webclaw/releases/latest) and unzip it into a folder
2. Open `chrome://extensions/` → enable **Developer mode**
3. Click **Load unpacked** → select the unzipped folder (the one that contains `manifest.json`)

<details>
<summary>Or build from source</summary>

```bash
git clone https://github.com/kuroko1t/webclaw.git && cd webclaw && pnpm install && pnpm build
```

Then load `packages/extension/dist/` as above.

</details>

### 3. Try it

Restart your MCP client and ask:

> **"Go to wikipedia.org and search for Model Context Protocol"**

Chrome launches automatically on the first tool call. The Side Panel shows all activity in real-time.

## How It Works

```mermaid
flowchart LR
    LLM["AI Assistant"]
    MCP["MCP Server"]
    EXT["Chrome Extension"]
    CS["Content Script"]

    LLM -- "stdio" --> MCP -- "WebSocket" --> EXT --> CS

    style LLM fill:#7b2d8b,stroke:#333,color:#fff
    style MCP fill:#1a5276,stroke:#333,color:#fff
    style EXT fill:#1e8449,stroke:#333,color:#fff
    style CS fill:#b7950b,stroke:#333,color:#fff
```

1. The AI calls MCP tools (`navigate_to`, `page_snapshot`, `click`, ...)
2. The MCP server forwards requests to the Chrome extension via WebSocket
3. The content script reads the page as a **compact accessibility tree** with `@ref` labels
4. The AI picks the right `@ref` and acts — no pixel coordinates, no CSS selectors

### `page_snapshot` output

```
[page "Wikipedia, the free encyclopedia"]
  [search]
    [form]
      [@e3 searchbox "Search Wikipedia"]    ← AI targets this
      [@e4 button "Search"]                 ← and clicks this
  [main]
    [heading[1] "Welcome to Wikipedia"]
    [group]
      [heading[2] "From today's featured article"]
      ...
```

Every interactive element gets a stable `@ref` label. The AI reads the tree, picks the right `@ref`, and calls `click` / `type_text` / `select_option`.

## MCP Tools (21)

<details>
<summary><b>Page Interaction</b> — navigate, snapshot, click, hover, type, select, drop files, screenshot, dialog, evaluate</summary>

| Tool | Parameters | Description |
|------|-----------|-------------|
| `navigate_to` | `url`, `tabId?` | Navigate to a URL |
| `page_snapshot` | `focusRegion?`, `interactiveOnly?`, `tabId?` | Get a compact accessibility tree with `@ref` labels |
| `click` | `ref`, `snapshotId`, `tabId?` | Click an element by its `@ref` label |
| `hover` | `ref`, `snapshotId`, `tabId?` | Hover over an element to reveal hidden UI (dropdowns, tooltips) |
| `type_text` | `ref`, `text`, `snapshotId`, `clearFirst?`, `pressKeys?`, `tabId?` | Type text into an input/textarea by `@ref` (`pressKeys` sends `\n`/`\t`/`,` as key presses) |
| `select_option` | `ref`, `value`, `snapshotId`, `tabId?` | Select a dropdown option by `@ref` |
| `drop_files` | `ref`, `snapshotId`, `files`, `tabId?` | Upload files via a file input or drop target (e.g., upload images to GitHub issues) |
| `screenshot` | `tabId?`, `savePath?` | Capture the visible area of the active tab. With `savePath`, the PNG is saved to that file instead of being returned inline |
| `handle_dialog` | `action`, `promptText?`, `tabId?` | Handle a native browser dialog (alert/confirm/prompt) |
| `evaluate` | `expression`, `tabId?` | Evaluate JavaScript in the page context (e.g., localStorage, cookies, computed styles) |

</details>

<details>
<summary><b>Keys, chip inputs and file uploads</b></summary>

**`type_text` key presses.** By default the whole `text` is set as the field value, newlines and
tabs included. With `pressKeys: true`, special characters are sent as real (trusted) key presses
through the Chrome debugger protocol, so widgets that only react to keyboard events work:

| Character in `text` | Sent as (with `pressKeys: true`) |
|---------------------|---------|
| `\n` | Enter (submit, commit a date/time picker, add a chip) |
| `\t` | Tab (move focus / blur to commit a field) |
| `,` | Comma key — only when the target is a chip/tag input (an ancestor's tag name, id or class contains `chip`/`chips` or `tag`/`tags` as a word); elsewhere commas are typed as text |

Example: `type_text(ref, "tag1,tag2,", pressKeys: true)` adds two chips in YouTube Studio's tag
field, and `type_text(ref, "2026/10/20\n", pressKeys: true)` commits a date picker's text field.
Enter can submit a form or send a chat message, so leave `pressKeys` off to enter multi-line
text as is. The surrounding text is inserted with trusted `Input.insertText` (IME-safe). The
debugger is attached only for the duration of the call (Chrome shows its "started debugging"
bar meanwhile) and is shared with `handle_dialog`. If it cannot attach (e.g. DevTools is open on
the tab), synthetic `KeyboardEvent`s are dispatched instead; if typing fails part way, the error
says how many characters were sent and nothing is typed again.

**`drop_files` on upload buttons.** If `ref` is not an `<input type="file">`, a file input near
`ref` is used: one in the same `<form>` / `<dialog>` / `[role="dialog"]`, or within five
ancestors when there is none (shadow DOM included), e.g. the hidden input behind a "Select files"
button. Inputs that are disabled, whose `accept` does not match the files, or that lack
`multiple` for several files are skipped; among the rest the closest one wins. Its `files` are
set directly, so no OS file picker is needed. Without such an input, synthetic drag-and-drop
events are dispatched on `ref`.

</details>

<details>
<summary><b>Tab Management</b> — new, list, switch, close</summary>

| Tool | Parameters | Description |
|------|-----------|-------------|
| `new_tab` | `url?` | Open a new tab (optionally with a URL) |
| `list_tabs` | | List all open tabs with tabId, URL, title, and active state |
| `switch_tab` | `tabId` | Switch to a specific tab |
| `close_tab` | `tabId` | Close a specific tab |

</details>

<details>
<summary><b>Navigation</b> — back, forward, reload, wait, scroll</summary>

| Tool | Parameters | Description |
|------|-----------|-------------|
| `go_back` | `tabId?` | Go back to the previous page |
| `go_forward` | `tabId?` | Go forward to the next page |
| `reload` | `tabId?`, `bypassCache?` | Reload the current page |
| `wait_for_navigation` | `tabId?`, `timeoutMs?` | Wait for the page to finish loading |
| `scroll_page` | `direction?`, `amount?`, `ref?`, `snapshotId?`, `tabId?` | Scroll the page or scroll to a specific element |

</details>

<details>
<summary><b>WebMCP</b> — discover and invoke page-declared tools</summary>

| Tool | Parameters | Description |
|------|-----------|-------------|
| `list_webmcp_tools` | `tabId?` | Discover tools on the page (native WebMCP + auto-synthesized from buttons/forms) |
| `invoke_webmcp_tool` | `toolName`, `args?`, `tabId?` | Invoke a discovered tool (native or synthesized) |

</details>

## Development

```bash
git clone https://github.com/kuroko1t/webclaw.git
cd webclaw
pnpm install
pnpm build        # Build all packages
pnpm test         # Run all tests
pnpm dev          # Watch mode
```

### Project Structure

```
packages/
  shared/          Type definitions, Zod schemas, utilities
  mcp-server/      MCP server with 21 tools, WebSocket bridge
  extension/       Chrome MV3 extension (service worker, content scripts, side panel)
examples/
  webmcp-demo-site/  WebMCP-enabled Todo app for testing native tool discovery
```

### Multi-Session Support

WebClaw automatically scans ports 18080–18089, so you can run up to **10 MCP server instances** simultaneously (e.g., multiple Claude Code sessions). Each instance binds to the first available port, and the Chrome extension connects to all of them.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WEBCLAW_PORT` | `18080` | WebSocket port for MCP server ↔ extension communication. When set, disables auto-scanning and uses only this port. The extension only connects to 18080–18089, so the port must be within that range. |
| `WEBCLAW_CHROME_PROFILE` | _(unset)_ | Chrome profile directory to open when Chrome is auto-launched (`--profile-directory`, e.g. `Default` or `Profile 1`). When unset, Chrome chooses the profile as usual. On macOS it only takes effect if Chrome is not already running. |

<details>
<summary><b>Troubleshooting</b></summary>

**Chrome extension not connected**
- Chrome is auto-launched when a tool is called. If it fails, start Chrome manually with the extension loaded
- If the auto-launched Chrome stops at the profile picker, set `WEBCLAW_CHROME_PROFILE` to the profile directory to open (e.g. `Default` or `Profile 1`, as shown in `chrome://version` → Profile Path)
- Check the Service Worker console (`chrome://extensions/` → Details → Service Worker) for `Connected to MCP server`
- Verify the MCP server is running (look for `WebSocket server listening on 127.0.0.1:<port>` in stderr)

**MCP client cannot connect**
- Ensure `npx webclaw-mcp` runs successfully from your terminal
- Check for port conflicts: WebClaw auto-scans 18080–18089. If one of them is taken by another program, set `WEBCLAW_PORT` to a free port within that range (the extension does not connect to ports outside it). If all ten are used by WebClaw instances, stop an unused instance
- Restart your MCP client after updating the config

**Content script not injecting**
- Content scripts only inject into `http://` and `https://` pages (not `chrome://`, `file://`, etc.)
- Try refreshing the page after loading the extension

**WebMCP tools not discovered**
- Native WebMCP requires Chrome 146+ with the `navigator.modelContext` API
- Verify the page declares tools via `navigator.modelContext.addTool()` or `<link rel="webmcp-manifest">`

</details>

## Contributing

Contributions are welcome! Please open an issue to discuss your idea before submitting a pull request.

## Disclaimer

WebClaw is a browser automation tool intended for legitimate use cases such as personal productivity, development, testing, and accessibility. Users are responsible for complying with the terms of service of any website they interact with. The authors are not responsible for any misuse of this tool.

## License

[MIT](LICENSE)
