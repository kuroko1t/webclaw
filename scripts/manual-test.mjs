#!/usr/bin/env node
/**
 * Manual E2E test script for v0.4.0 new tools.
 * Spawns the MCP server, launches Chrome with the extension, and invokes real tools.
 */
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(__dirname, '../packages/mcp-server/dist/cli.js');
const extensionPath = resolve(__dirname, '../packages/extension/dist');

// --- Helpers ---
let nextId = 1;
let buffer = '';
let responseResolvers = new Map();
let child;

function send(method, params = {}) {
  const id = nextId++;
  const msg = { jsonrpc: '2.0', id, method, params };
  child.stdin.write(JSON.stringify(msg) + '\n');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      responseResolvers.delete(id);
      reject(new Error(`Timeout waiting for response to ${method} (id=${id})`));
    }, 90_000);
    responseResolvers.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
  });
}

function sendNotification(method, params = {}) {
  const msg = { jsonrpc: '2.0', method, params };
  child.stdin.write(JSON.stringify(msg) + '\n');
}

function callTool(name, args = {}) {
  return send('tools/call', { name, arguments: args });
}

function parseResponses(data) {
  buffer += data;
  const lines = buffer.split('\n');
  buffer = lines.pop();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const msg = JSON.parse(trimmed);
      if (msg.id != null && responseResolvers.has(msg.id)) {
        const { resolve } = responseResolvers.get(msg.id);
        responseResolvers.delete(msg.id);
        resolve(msg);
      }
    } catch {}
  }
}

function getText(result) {
  if (result?.result?.content?.[0]?.text) return result.result.content[0].text;
  if (result?.result?.content?.[0]?.type === 'image') return '[image data]';
  return JSON.stringify(result?.result || result?.error || result);
}

function isError(result) {
  return result?.result?.isError === true || result?.error != null;
}

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
const INFO = '\x1b[36mℹ\x1b[0m';
let passed = 0, failed = 0;

function assert(cond, label, detail = '') {
  if (cond) { console.log(`  ${PASS} ${label}`); passed++; }
  else { console.log(`  ${FAIL} ${label} ${detail}`); failed++; }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// --- Main ---
async function main() {
  // Use the default port 18080 that the extension expects
  const port = 18080;
  console.log(`\n${INFO} Starting MCP server on port ${port}...\n`);

  child = spawn('node', [cliPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, WEBCLAW_PORT: String(port) },
  });

  child.stdout.on('data', (chunk) => parseResponses(chunk.toString()));

  let serverStderr = '';
  child.stderr.on('data', (chunk) => {
    const msg = chunk.toString().trim();
    serverStderr += chunk.toString();
    if (msg) console.log(`  [server] ${msg}`);
  });

  // Wait for server ready
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server startup timeout')), 15000);
    const checkReady = () => {
      if (serverStderr.includes('MCP Server started')) { clearTimeout(timeout); resolve(); }
      else setTimeout(checkReady, 100);
    };
    checkReady();
  });

  // Initialize MCP handshake
  const initResult = await send('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'manual-test', version: '0.0.1' },
  });
  assert(initResult.result?.serverInfo?.version === '0.4.0', 'Server version is 0.4.0');

  sendNotification('notifications/initialized');
  await sleep(200);

  // List tools
  const toolsResult = await send('tools/list', {});
  const toolNames = toolsResult.result?.tools?.map(t => t.name) || [];
  assert(toolNames.length === 17, `17 tools registered (got ${toolNames.length})`);

  const newTools = ['new_tab', 'list_tabs', 'switch_tab', 'close_tab', 'go_back', 'go_forward', 'reload', 'wait_for_navigation', 'scroll_page'];
  for (const name of newTools) {
    assert(toolNames.includes(name), `Tool "${name}" exists`);
  }

  // Launch Chrome with existing profile (extension already installed via Load unpacked)
  if (!serverStderr.includes('Extension connected')) {
    console.log(`\n${INFO} Launching Chrome with existing profile (extension: dfflhdhjcejnbijjbpkplobagkejmeje)...`);
    console.log(`  ${INFO} Extension path: ${extensionPath}\n`);
    const chromeProc = spawn('google-chrome', [
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ], { detached: true, stdio: 'ignore' });
    chromeProc.unref();

    // Wait for extension to connect
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Extension did not connect within 45s')), 45_000);
      const check = () => {
        if (serverStderr.includes('Extension connected')) { clearTimeout(timeout); resolve(); }
        else setTimeout(check, 500);
      };
      check();
    });
    console.log(`  ${PASS} Extension connected\n`);
    await sleep(1000);
  }

  // Pre-flight: check if extension supports new methods
  console.log(`\n${INFO} Pre-flight: checking if extension supports new methods...`);
  let preflight = await callTool('list_tabs', {});
  if (isError(preflight) && getText(preflight).includes('Unknown method')) {
    console.log(`\n  ${FAIL} Extension is running OLD code (v0.3.x). New methods are not supported.`);
    console.log(`  ${INFO} Please reload the extension:`);
    console.log(`    1. Open chrome://extensions in your browser`);
    console.log(`    2. Find "WebClaw" extension`);
    console.log(`    3. Click the reload ↻ button`);
    console.log(`    4. Run this test again\n`);
    console.log(`  ${INFO} Alternatively, if using Load unpacked from packages/extension/dist/,`);
    console.log(`         Chrome should have already reloaded. Try closing ALL Chrome windows`);
    console.log(`         and run again.\n`);
    child.kill('SIGTERM');
    process.exit(1);
  }

  // =========================================
  // Test 1: navigate_to (existing tool, now uses requestWithRetry)
  // =========================================
  console.log('\n--- Test: navigate_to (regression) ---');
  let r = await callTool('navigate_to', { url: 'https://example.com' });
  assert(!isError(r), 'navigate_to https://example.com');
  console.log(`  ${INFO} ${getText(r)}`);

  // =========================================
  // Test 2: page_snapshot
  // =========================================
  console.log('\n--- Test: page_snapshot ---');
  r = await callTool('page_snapshot', {});
  assert(!isError(r), 'page_snapshot succeeds');
  const snapText = getText(r);
  const snapMatch = snapText.match(/Snapshot ID: (snap-[^\n]+)/);
  const snapshotId = snapMatch?.[1];
  assert(!!snapshotId, `Got snapshot ID: ${snapshotId}`);
  console.log(`  ${INFO} ${snapText.slice(0, 300)}...`);

  // =========================================
  // Test 3: new_tab
  // =========================================
  console.log('\n--- Test: new_tab ---');
  r = await callTool('new_tab', { url: 'https://www.google.com' });
  assert(!isError(r), 'new_tab https://www.google.com');
  console.log(`  ${INFO} ${getText(r)}`);

  // =========================================
  // Test 4: new_tab (no URL)
  // =========================================
  console.log('\n--- Test: new_tab (no URL) ---');
  r = await callTool('new_tab', {});
  assert(!isError(r), 'new_tab without URL');
  console.log(`  ${INFO} ${getText(r)}`);

  // =========================================
  // Test 5: list_tabs
  // =========================================
  console.log('\n--- Test: list_tabs ---');
  r = await callTool('list_tabs', {});
  assert(!isError(r), 'list_tabs succeeds');
  const tabsText = getText(r);
  console.log(`  ${INFO} ${tabsText}`);

  // Parse tab IDs from output
  const tabIdMatches = [...tabsText.matchAll(/\[(\d+)\]/g)];
  const tabIds = tabIdMatches.map(m => parseInt(m[1]));
  assert(tabIds.length >= 3, `Found ${tabIds.length} tabs (expected >= 3)`);

  // =========================================
  // Test 6: switch_tab
  // =========================================
  console.log('\n--- Test: switch_tab ---');
  if (tabIds.length >= 2) {
    const firstTabId = tabIds[0];
    r = await callTool('switch_tab', { tabId: firstTabId });
    assert(!isError(r), `switch_tab to tab ${firstTabId}`);
    console.log(`  ${INFO} ${getText(r)}`);
  }

  // =========================================
  // Test 7: close_tab (close the empty new tab)
  // =========================================
  console.log('\n--- Test: close_tab ---');
  if (tabIds.length >= 3) {
    const lastTabId = tabIds[tabIds.length - 1]; // the "no URL" tab
    r = await callTool('close_tab', { tabId: lastTabId });
    assert(!isError(r), `close_tab ${lastTabId}`);
    console.log(`  ${INFO} ${getText(r)}`);

    // Verify
    r = await callTool('list_tabs', {});
    const afterText = getText(r);
    assert(!afterText.includes(`[${lastTabId}]`), `Tab ${lastTabId} no longer in list`);
    console.log(`  ${INFO} Remaining: ${afterText.split('\n')[0]}`);
  }

  // =========================================
  // Test 8: Build navigation history on a new tab (example.com → Wikipedia)
  // =========================================
  console.log('\n--- Test: build navigation history ---');
  r = await callTool('new_tab', { url: 'https://example.com' });
  assert(!isError(r), 'new_tab example.com (for history)');
  const historyTabResult = JSON.parse(getText(r).replace(/^[^{]*/, '').replace(/[^}]*$/, '') || '{}');
  // Extract tabId from the response text
  const historyTabMatch = getText(r).match(/tab \((\d+)\)/i);
  const historyTabId = historyTabMatch ? parseInt(historyTabMatch[1]) : null;
  console.log(`  ${INFO} ${getText(r)}`);
  console.log(`  ${INFO} History tab ID: ${historyTabId}`);
  await sleep(500);

  if (historyTabId) {
    r = await callTool('navigate_to', { url: 'https://en.wikipedia.org/wiki/Web_browser', tabId: historyTabId });
    assert(!isError(r), 'navigate_to Wikipedia (for history)');
    console.log(`  ${INFO} ${getText(r)}`);
    await sleep(1000);
  }

  // =========================================
  // Test 9: scroll_page (down) - on the history tab
  // =========================================
  console.log('\n--- Test: scroll_page (down) ---');
  r = await callTool('scroll_page', { direction: 'down', tabId: historyTabId });
  assert(!isError(r), 'scroll_page down');
  console.log(`  ${INFO} ${getText(r)}`);

  // =========================================
  // Test 10: scroll_page (up with amount)
  // =========================================
  console.log('\n--- Test: scroll_page (up, amount=300) ---');
  r = await callTool('scroll_page', { direction: 'up', amount: 300, tabId: historyTabId });
  assert(!isError(r), 'scroll_page up 300px');
  console.log(`  ${INFO} ${getText(r)}`);

  // =========================================
  // Test 11: scroll_page (to element by ref)
  // =========================================
  console.log('\n--- Test: scroll_page (to element by ref) ---');
  r = await callTool('page_snapshot', { tabId: historyTabId });
  assert(!isError(r), 'page_snapshot for ref');
  const snapText2 = getText(r);
  const snapMatch2 = snapText2.match(/Snapshot ID: (snap-[^\n]+)/);
  const snapshotId2 = snapMatch2?.[1];
  // Find a ref
  const refMatch = snapText2.match(/(@e\d+)/);
  if (refMatch && snapshotId2) {
    const ref = refMatch[1];
    r = await callTool('scroll_page', { ref, snapshotId: snapshotId2, tabId: historyTabId });
    assert(!isError(r), `scroll_page to ${ref}`);
    console.log(`  ${INFO} ${getText(r)}`);
  } else {
    console.log(`  ${INFO} No ref found in snapshot, skipping ref scroll test`);
  }

  // =========================================
  // Test 12: go_back (Wikipedia → example.com) using explicit tabId
  // =========================================
  console.log('\n--- Test: go_back ---');
  r = await callTool('go_back', { tabId: historyTabId });
  assert(!isError(r), 'go_back');
  const goBackText = getText(r);
  console.log(`  ${INFO} ${goBackText}`);
  assert(goBackText.toLowerCase().includes('example'), 'go_back returned to example.com');
  await sleep(500);

  // =========================================
  // Test 13: go_forward (example.com → Wikipedia) using explicit tabId
  // =========================================
  console.log('\n--- Test: go_forward ---');
  r = await callTool('go_forward', { tabId: historyTabId });
  assert(!isError(r), 'go_forward');
  const goFwdText = getText(r);
  console.log(`  ${INFO} ${goFwdText}`);
  assert(goFwdText.toLowerCase().includes('wikipedia'), 'go_forward returned to Wikipedia');

  // =========================================
  // Test 14: reload (using explicit tabId)
  // =========================================
  console.log('\n--- Test: reload ---');
  r = await callTool('reload', { tabId: historyTabId });
  assert(!isError(r), 'reload');
  console.log(`  ${INFO} ${getText(r)}`);

  // =========================================
  // Test 15: reload with bypassCache
  // =========================================
  console.log('\n--- Test: reload (bypassCache=true) ---');
  r = await callTool('reload', { bypassCache: true, tabId: historyTabId });
  assert(!isError(r), 'reload bypassCache=true');
  console.log(`  ${INFO} ${getText(r)}`);

  // =========================================
  // Test 16: wait_for_navigation (on already-loaded tab)
  // =========================================
  console.log('\n--- Test: wait_for_navigation ---');
  r = await callTool('wait_for_navigation', { tabId: historyTabId });
  assert(!isError(r), 'wait_for_navigation');
  console.log(`  ${INFO} ${getText(r)}`);

  // =========================================
  // Test 17: screenshot (regression) - on a regular page
  // =========================================
  console.log('\n--- Test: screenshot (regression) ---');
  // Switch to the history tab to make sure we're on a regular page
  await callTool('switch_tab', { tabId: historyTabId });
  await sleep(500);
  r = await callTool('screenshot', { tabId: historyTabId });
  assert(!isError(r), 'screenshot succeeds');
  const ssContent = r?.result?.content?.[0];
  assert(ssContent?.type === 'image', 'screenshot returns image type');

  // =========================================
  // Test 18: Error - close_tab with invalid tabId
  // =========================================
  console.log('\n--- Test: close_tab (invalid tabId → error) ---');
  r = await callTool('close_tab', { tabId: 999999 });
  assert(isError(r), 'close_tab invalid ID returns error');
  console.log(`  ${INFO} ${getText(r).slice(0, 200)}`);

  // =========================================
  // Test 19: Error - switch_tab with invalid tabId
  // =========================================
  console.log('\n--- Test: switch_tab (invalid tabId → error) ---');
  r = await callTool('switch_tab', { tabId: 999999 });
  assert(isError(r), 'switch_tab invalid ID returns error');
  console.log(`  ${INFO} ${getText(r).slice(0, 200)}`);

  // =========================================
  // Test 20: Clean up - close Google tab
  // =========================================
  console.log('\n--- Test: cleanup - close Google tab ---');
  r = await callTool('list_tabs', {});
  const finalTabs = getText(r);
  const googleMatch = finalTabs.match(/\[(\d+)\].*google/i);
  if (googleMatch) {
    const googleTabId = parseInt(googleMatch[1]);
    r = await callTool('close_tab', { tabId: googleTabId });
    assert(!isError(r), `Closed Google tab ${googleTabId}`);
  }

  // =========================================
  // Summary
  // =========================================
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log(`${'='.repeat(50)}\n`);

  child.kill('SIGTERM');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\nFatal error:', err.message);
  if (child) child.kill('SIGTERM');
  process.exit(1);
});
