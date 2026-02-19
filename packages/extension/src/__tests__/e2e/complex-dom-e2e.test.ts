/**
 * E2E: Complex DOM scenarios
 *
 * Tests snapshots and actions on complex, real-world-like pages:
 * aria-hidden exclusion, display:none exclusion, nested forms,
 * iframe exclusion, large DOMs, and contenteditable elements.
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
  <h1>Complex DOM Test</h1>

  <!-- aria-hidden elements should be excluded from snapshot -->
  <div aria-hidden="true">
    <button id="hidden-btn">Hidden Button</button>
    <input id="hidden-input" aria-label="Hidden input">
  </div>

  <!-- display:none elements should be excluded -->
  <div style="display:none">
    <button id="invisible-btn">Invisible Button</button>
  </div>

  <!-- Visible elements for comparison -->
  <button id="visible-btn">Visible Button</button>

  <!-- Nested form structure -->
  <form>
    <fieldset>
      <legend>Nested Form</legend>
      <input id="nested-input" type="text" aria-label="Nested input">
    </fieldset>
  </form>

  <!-- iframe content should not appear in snapshot -->
  <iframe id="test-iframe" srcdoc="<button>IFrame Button</button>" style="width:200px;height:100px;"></iframe>

  <!-- contenteditable element -->
  <div contenteditable="true" id="editable" aria-label="Editable area">initial</div>
</body>
</html>`;

// Generate large DOM page with 100+ elements
function generateLargeDOMHTML(): string {
  let items = '';
  for (let i = 0; i < 120; i++) {
    items += `<li><button id="item-${i}">Item ${i}</button></li>\n`;
  }
  return `<!DOCTYPE html>
<html>
<body>
  <h1>Large DOM Test</h1>
  <ul>${items}</ul>
</body>
</html>`;
}

describe('Complex DOM E2E', () => {
  let browser: Browser;
  let server: Server;
  let port: number;
  let page: Page;

  beforeAll(async () => {
    ({ server, port } = await startTestServer({
      '/': TEST_HTML,
      '/large': generateLargeDOMHTML(),
    }));
    browser = await launchBrowserWithExtension();
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
    server?.close();
  });

  beforeEach(async () => {
    page = await browser.newPage();
  }, 20_000);

  afterEach(async () => {
    await page?.close();
  });

  it('should exclude aria-hidden="true" elements from snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/`);
    const snapshot = await sendToContentScript(browser, page, { action: 'snapshot' });

    // aria-hidden elements should NOT appear
    expect(snapshot.text).not.toContain('Hidden Button');
    expect(snapshot.text).not.toContain('Hidden input');

    // Visible button should appear
    expect(snapshot.text).toContain('Visible Button');
  }, 15_000);

  it('should exclude display:none elements from snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/`);
    const snapshot = await sendToContentScript(browser, page, { action: 'snapshot' });

    expect(snapshot.text).not.toContain('Invisible Button');
  }, 15_000);

  it('should handle nested form elements correctly', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/`);
    const snapshot = await sendToContentScript(browser, page, { action: 'snapshot' });
    const ref = extractRef(snapshot.text, 'Nested input');
    expect(ref).toBeTruthy();

    const result = await sendToContentScript(browser, page, {
      action: 'typeText',
      ref,
      text: 'nested value',
    });
    expect(result.success).toBe(true);

    const value = await page.evaluate(() => {
      return (document.getElementById('nested-input') as HTMLInputElement)?.value;
    });
    expect(value).toBe('nested value');
  }, 15_000);

  it('should not include iframe content in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/`);
    // Wait for iframe to load
    await new Promise((r) => setTimeout(r, 1000));

    const snapshot = await sendToContentScript(browser, page, { action: 'snapshot' });

    // The iframe button should not be in the main page snapshot
    expect(snapshot.text).not.toContain('IFrame Button');
  }, 15_000);

  it('should handle large DOMs with 100+ elements', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/large`);
    const snapshot = await sendToContentScript(browser, page, { action: 'snapshot' });

    expect(snapshot.text).toContain('@e');
    expect(snapshot.snapshotId).toMatch(/^snap-/);
    // Should contain at least some of the items
    expect(snapshot.text).toContain('Item 0');
  }, 15_000);

  it('should truncate large snapshots with maxTokens', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/large`);
    const snapshot = await sendToContentScript(browser, page, {
      action: 'snapshot',
      maxTokens: 100,
    });

    // With only 100 tokens (400 chars), the snapshot should be truncated
    expect(snapshot.text).toContain('(truncated)');
  }, 15_000);

  it('should typeText into a contenteditable element', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/`);
    const snapshot = await sendToContentScript(browser, page, { action: 'snapshot' });
    const ref = extractRef(snapshot.text, 'Editable area');
    expect(ref).toBeTruthy();

    const result = await sendToContentScript(browser, page, {
      action: 'typeText',
      ref,
      text: 'edited content',
    });
    expect(result.success).toBe(true);

    const content = await page.evaluate(() => {
      return document.getElementById('editable')?.textContent;
    });
    expect(content).toBe('edited content');
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
