/**
 * E2E: Snapshot + Action execution
 *
 * Tests the full cycle: take a snapshot of a real page, find @ref labels,
 * execute actions (click, typeText, selectOption), and verify DOM changes.
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
  <h1>Snapshot Test</h1>
  <button id="btn1">Click Me</button>
  <input id="input1" type="text" placeholder="Enter text" aria-label="Name input">
  <select id="select1" aria-label="Color picker">
    <option value="red">Red</option>
    <option value="green">Green</option>
    <option value="blue">Blue</option>
  </select>
  <div id="output">Initial</div>
  <script>
    document.getElementById('btn1').addEventListener('click', () => {
      document.getElementById('output').textContent = 'Clicked!';
    });
  </script>
</body>
</html>`;

describe('Snapshot + Actions E2E', () => {
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

  it('should take a snapshot containing @ref labels', async () => {
    const result = await sendToContentScript(browser, page, { action: 'snapshot' });

    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('snapshotId');
    expect(result.text).toContain('@e');
    expect(result.snapshotId).toMatch(/^snap-/);
  }, 15_000);

  it('should generate a unique snapshotId each time', async () => {
    const r1 = await sendToContentScript(browser, page, { action: 'snapshot' });
    const r2 = await sendToContentScript(browser, page, { action: 'snapshot' });

    expect(r1.snapshotId).toMatch(/^snap-/);
    expect(r2.snapshotId).toMatch(/^snap-/);
    expect(r1.snapshotId).not.toBe(r2.snapshotId);
  }, 15_000);

  it('should click a button and change the DOM', async () => {
    const snapshot = await sendToContentScript(browser, page, { action: 'snapshot' });
    const btnRef = extractRef(snapshot.text, 'Click Me');
    expect(btnRef).toBeTruthy();

    const clickResult = await sendToContentScript(browser, page, {
      action: 'click',
      ref: btnRef,
    });
    expect(clickResult.success).toBe(true);

    const outputText = await page.evaluate(() => {
      return document.getElementById('output')?.textContent;
    });
    expect(outputText).toBe('Clicked!');
  }, 15_000);

  it('should type text into an input', async () => {
    const snapshot = await sendToContentScript(browser, page, { action: 'snapshot' });
    const inputRef = extractRef(snapshot.text, 'Name input');
    expect(inputRef).toBeTruthy();

    const typeResult = await sendToContentScript(browser, page, {
      action: 'typeText',
      ref: inputRef,
      text: 'Hello World',
    });
    expect(typeResult.success).toBe(true);

    const inputValue = await page.evaluate(() => {
      return (document.getElementById('input1') as HTMLInputElement)?.value;
    });
    expect(inputValue).toBe('Hello World');
  }, 15_000);

  it('should select an option from a dropdown', async () => {
    const snapshot = await sendToContentScript(browser, page, { action: 'snapshot' });
    const selectRef = extractRef(snapshot.text, 'Color picker');
    expect(selectRef).toBeTruthy();

    const selectResult = await sendToContentScript(browser, page, {
      action: 'selectOption',
      ref: selectRef,
      value: 'blue',
    });
    expect(selectResult.success).toBe(true);

    const selectedValue = await page.evaluate(() => {
      return (document.getElementById('select1') as HTMLSelectElement)?.value;
    });
    expect(selectedValue).toBe('blue');
  }, 15_000);
});

/**
 * Extract the @ref label for an element identified by nearby text in the snapshot.
 * The snapshot format is like: [@e1 button "Click Me"]
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
