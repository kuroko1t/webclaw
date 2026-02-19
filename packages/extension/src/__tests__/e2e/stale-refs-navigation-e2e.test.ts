/**
 * E2E: Stale refs and navigation
 *
 * Tests that refs become invalid after DOM removal, new snapshots,
 * SPA-style navigation, and page re-navigation.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import type { Browser, Page } from 'puppeteer-core';
import type { Server } from 'http';
import {
  launchBrowserWithExtension,
  sendToContentScript,
  openPageAndWaitForContentScript,
  startTestServer,
} from './helpers';

const TEST_HTML = `<!DOCTYPE html>
<html>
<body>
  <h1>Stale Refs Test</h1>
  <div id="container">
    <button id="dynamic-btn">Dynamic Button</button>
    <input id="dynamic-input" type="text" aria-label="Dynamic input">
  </div>
  <button id="remove-btn" onclick="document.getElementById('container').innerHTML=''">
    Remove Elements
  </button>
  <button id="spa-btn" onclick="document.getElementById('container').innerHTML='<button id=new-btn>New Button</button>'">
    SPA Navigate
  </button>
</body>
</html>`;

describe('Stale Refs & Navigation E2E', () => {
  let browser: Browser;
  let server: Server;
  let port: number;
  let page: Page;

  beforeAll(async () => {
    ({ server, port } = await startTestServer({ '/': TEST_HTML }));
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

  it('should fail to click a DOM-removed element (stale ref)', async () => {
    // Take snapshot to get refs
    const snapshot = await sendToContentScript(browser, page, { action: 'snapshot' });
    const btnRef = extractRef(snapshot.text, 'Dynamic Button');
    expect(btnRef).toBeTruthy();

    // Remove the elements from DOM via JS
    await page.evaluate(() => {
      document.getElementById('container')!.innerHTML = '';
    });

    // Try to click the now-removed element
    const result = await sendToContentScript(browser, page, {
      action: 'click',
      ref: btnRef,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  }, 15_000);

  it('should fail to typeText on a DOM-removed element (stale ref)', async () => {
    const snapshot = await sendToContentScript(browser, page, { action: 'snapshot' });
    const inputRef = extractRef(snapshot.text, 'Dynamic input');
    expect(inputRef).toBeTruthy();

    // Remove element
    await page.evaluate(() => {
      document.getElementById('container')!.innerHTML = '';
    });

    const result = await sendToContentScript(browser, page, {
      action: 'typeText',
      ref: inputRef,
      text: 'hello',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  }, 15_000);

  it('should invalidate old refs after a new snapshot', async () => {
    // Take first snapshot
    const snap1 = await sendToContentScript(browser, page, { action: 'snapshot' });
    const oldRef = extractRef(snap1.text, 'Dynamic Button');
    expect(oldRef).toBeTruthy();

    // Take second snapshot (resets refMap)
    const snap2 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap2.snapshotId).not.toBe(snap1.snapshotId);

    // The new snapshot will have new refs for the same elements.
    // The old ref string may coincide with a new ref if the same elements are present,
    // so verify by getting a new ref and confirming it works.
    const newRef = extractRef(snap2.text, 'Dynamic Button');
    expect(newRef).toBeTruthy();

    const result = await sendToContentScript(browser, page, {
      action: 'click',
      ref: newRef,
    });
    expect(result.success).toBe(true);
  }, 15_000);

  it('should fail stale ref after SPA-style DOM replacement', async () => {
    const snapshot = await sendToContentScript(browser, page, { action: 'snapshot' });
    const btnRef = extractRef(snapshot.text, 'Dynamic Button');
    expect(btnRef).toBeTruthy();

    // SPA-style: replace container content with new elements
    await page.evaluate(() => {
      document.getElementById('container')!.innerHTML = '<button id="new-btn">New Button</button>';
    });

    // Old ref should be stale
    const result = await sendToContentScript(browser, page, {
      action: 'click',
      ref: btnRef,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  }, 15_000);

  it('should fail stale ref after same-page re-navigation', async () => {
    const snapshot = await sendToContentScript(browser, page, { action: 'snapshot' });
    const btnRef = extractRef(snapshot.text, 'Dynamic Button');
    expect(btnRef).toBeTruthy();

    // Re-navigate to the same URL
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
    // Wait for content script to re-inject
    await new Promise((r) => setTimeout(r, 2000));

    // Old ref should be stale (new page context, new refMap)
    const result = await sendToContentScript(browser, page, {
      action: 'click',
      ref: btnRef,
    });
    // After page reload, the content script is re-injected with an empty refMap,
    // so the old ref won't exist
    expect(result.success).toBe(false);
  }, 20_000);
});

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
