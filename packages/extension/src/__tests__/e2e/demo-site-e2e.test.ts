/**
 * E2E: Demo Site (WebMCP Todo App)
 *
 * Opens the actual demo site HTML via an HTTP server and tests end-to-end
 * snapshot, WebMCP tool discovery, and interaction flows.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { resolve } from 'path';
import type { Browser, Page } from 'puppeteer-core';
import type { Server } from 'http';
import {
  launchBrowserWithExtension,
  sendToContentScript,
  openPageAndWaitForContentScript,
  startStaticServer,
} from './helpers';

const DEMO_SITE_DIR = resolve(__dirname, '../../../../../examples/webmcp-demo-site');

describe('Demo Site E2E', () => {
  let browser: Browser;
  let server: Server;
  let port: number;
  let page: Page;

  beforeAll(async () => {
    ({ server, port } = await startStaticServer(DEMO_SITE_DIR));
    browser = await launchBrowserWithExtension();
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
    server?.close();
  });

  beforeEach(async () => {
    page = await browser.newPage();
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/`);
  }, 20_000);

  afterEach(async () => {
    await page?.close();
  });

  it('should take a snapshot of the demo site', async () => {
    const result = await sendToContentScript(browser, page, { action: 'snapshot' });

    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('snapshotId');
    expect(result.text).toContain('@e');
    // Should contain the todo items from the demo
    expect(result.text).toContain('Learn about WebMCP');
  }, 15_000);

  it('should discover auto-synthesized tools from DOM forms', async () => {
    const result = await sendToContentScript(browser, page, {
      action: 'listWebMCPTools',
    });

    expect(result).toHaveProperty('tools');
    expect(Array.isArray(result.tools)).toBe(true);
    // Should have at least one synthesized tool (the add form or buttons)
    expect(result.tools.length).toBeGreaterThan(0);
  }, 15_000);

  it('should add a todo via snapshot -> typeText -> click', async () => {
    // Take initial snapshot
    const snapshot = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Find the input ref (aria-label="New todo text")
    const inputRef = extractRef(snapshot.text, 'New todo text');
    expect(inputRef).toBeTruthy();

    // Find the Add button ref
    const addBtnRef = extractRef(snapshot.text, 'Add');
    expect(addBtnRef).toBeTruthy();

    // Type the new todo text
    const typeResult = await sendToContentScript(browser, page, {
      action: 'typeText',
      ref: inputRef,
      text: 'E2E test todo',
    });
    expect(typeResult.success).toBe(true);

    // Click the Add button
    const clickResult = await sendToContentScript(browser, page, {
      action: 'click',
      ref: addBtnRef,
    });
    expect(clickResult.success).toBe(true);

    // Wait for DOM update
    await new Promise((r) => setTimeout(r, 500));

    // Verify the new todo appears in the DOM
    const todoExists = await page.evaluate(() => {
      const items = document.querySelectorAll('.todo-text');
      return Array.from(items).some((el) => el.textContent === 'E2E test todo');
    });
    expect(todoExists).toBe(true);

    // Also verify via a new snapshot
    const newSnapshot = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(newSnapshot.text).toContain('E2E test todo');
  }, 20_000);
});

/**
 * Extract the @ref label for an element identified by nearby text in the snapshot.
 */
function extractRef(snapshotText: string, labelText: string): string | null {
  const lines = snapshotText.split('\n');
  for (const line of lines) {
    if (line.includes(labelText)) {
      const refMatch = line.match(/@e\d+/);
      if (refMatch) return refMatch[0];
    }
  }
  return null;
}
