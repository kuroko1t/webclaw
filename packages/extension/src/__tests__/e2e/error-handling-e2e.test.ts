/**
 * E2E: Error handling
 *
 * Tests error cases that arise during real usage: disabled elements, invalid refs,
 * type mismatches, invalid options, and readonly inputs.
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
  <h1>Error Handling Test</h1>
  <button id="btn-disabled" disabled>Disabled Button</button>
  <button id="btn-normal">Normal Button</button>
  <input id="input-readonly" readonly value="fixed" aria-label="Readonly input">
  <input id="input-normal" type="text" aria-label="Normal input">
  <select id="select1" aria-label="Color picker">
    <option value="red">Red</option>
    <option value="green">Green</option>
  </select>
</body>
</html>`;

describe('Error Handling E2E', () => {
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

  it('should fail to click a disabled button', async () => {
    const snapshot = await sendToContentScript(browser, page, { action: 'snapshot' });
    const ref = extractRef(snapshot.text, 'Disabled Button');
    expect(ref).toBeTruthy();

    const result = await sendToContentScript(browser, page, {
      action: 'click',
      ref,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('disabled');
  }, 15_000);

  it('should fail to click a non-existent @ref', async () => {
    // Take snapshot first so content script has refs initialized
    await sendToContentScript(browser, page, { action: 'snapshot' });

    const result = await sendToContentScript(browser, page, {
      action: 'click',
      ref: '@e9999',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  }, 15_000);

  it('should fail to typeText on a non-existent @ref', async () => {
    await sendToContentScript(browser, page, { action: 'snapshot' });

    const result = await sendToContentScript(browser, page, {
      action: 'typeText',
      ref: '@e9999',
      text: 'hello',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  }, 15_000);

  it('should fail to selectOption on a non-existent @ref', async () => {
    await sendToContentScript(browser, page, { action: 'snapshot' });

    const result = await sendToContentScript(browser, page, {
      action: 'selectOption',
      ref: '@e9999',
      value: 'red',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  }, 15_000);

  it('should fail to typeText on a button element', async () => {
    const snapshot = await sendToContentScript(browser, page, { action: 'snapshot' });
    const ref = extractRef(snapshot.text, 'Normal Button');
    expect(ref).toBeTruthy();

    const result = await sendToContentScript(browser, page, {
      action: 'typeText',
      ref,
      text: 'hello',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not a text input');
  }, 15_000);

  it('should fail to selectOption on an input element', async () => {
    const snapshot = await sendToContentScript(browser, page, { action: 'snapshot' });
    const ref = extractRef(snapshot.text, 'Normal input');
    expect(ref).toBeTruthy();

    const result = await sendToContentScript(browser, page, {
      action: 'selectOption',
      ref,
      value: 'red',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not a select');
  }, 15_000);

  it('should fail to selectOption with an invalid option value', async () => {
    const snapshot = await sendToContentScript(browser, page, { action: 'snapshot' });
    const ref = extractRef(snapshot.text, 'Color picker');
    expect(ref).toBeTruthy();

    const result = await sendToContentScript(browser, page, {
      action: 'selectOption',
      ref,
      value: 'purple',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  }, 15_000);

  it('should succeed typeText on a readonly input (browser allows value setting)', async () => {
    const snapshot = await sendToContentScript(browser, page, { action: 'snapshot' });
    const ref = extractRef(snapshot.text, 'Readonly input');
    expect(ref).toBeTruthy();

    // typeText sets value programmatically which works even on readonly inputs
    const result = await sendToContentScript(browser, page, {
      action: 'typeText',
      ref,
      text: 'new value',
    });
    expect(result.success).toBe(true);
  }, 15_000);
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
