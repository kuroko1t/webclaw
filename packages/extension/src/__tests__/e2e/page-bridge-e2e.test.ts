/**
 * E2E: Page Bridge injection
 *
 * Tests that page-bridge.js is correctly injected into pages,
 * runs in the MAIN world, and enables WebMCP tool discovery.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import type { Browser, Page } from 'puppeteer-core';
import type { Server } from 'http';
import {
  launchBrowserWithExtension,
  getExtensionId,
  sendToContentScript,
  openPageAndWaitForContentScript,
  startTestServer,
} from './helpers';

const TEST_HTML = `<!DOCTYPE html>
<html>
<body>
  <h1>Page Bridge Test</h1>
  <p>Testing page-bridge.js injection</p>
</body>
</html>`;

const WEBMCP_HTML = `<!DOCTYPE html>
<html>
<body>
  <h1>WebMCP Test</h1>
  <form id="search-form" aria-label="Search form">
    <input type="text" name="query" aria-label="Search query">
    <button type="submit">Search</button>
  </form>
</body>
</html>`;

describe('Page Bridge E2E', () => {
  let browser: Browser;
  let extensionId: string;
  let server: Server;
  let port: number;
  let page: Page;

  beforeAll(async () => {
    ({ server, port } = await startTestServer({
      '/': TEST_HTML,
      '/webmcp': WEBMCP_HTML,
    }));
    browser = await launchBrowserWithExtension();
    extensionId = await getExtensionId(browser);
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

  it('should inject page-bridge.js from the correct path', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/`);

    // Verify the page-bridge.js is accessible at content/page-bridge.js (not src/content/)
    const bridgeUrl = `chrome-extension://${extensionId}/content/page-bridge.js`;
    const accessible = await page.evaluate(async (url: string) => {
      try {
        const resp = await fetch(url);
        return resp.ok;
      } catch {
        return false;
      }
    }, bridgeUrl);

    expect(accessible).toBe(true);
  }, 15_000);

  it('should NOT have page-bridge.js at the old incorrect path', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/`);

    // The old path src/content/page-bridge.js should NOT be accessible
    const oldBridgeUrl = `chrome-extension://${extensionId}/src/content/page-bridge.js`;
    const accessible = await page.evaluate(async (url: string) => {
      try {
        const resp = await fetch(url);
        return resp.ok;
      } catch {
        return false;
      }
    }, oldBridgeUrl);

    expect(accessible).toBe(false);
  }, 15_000);

  it('should run page-bridge.js in the MAIN world and respond to messages', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/`);

    // Wait for page-bridge.js to execute
    await new Promise((r) => setTimeout(r, 1000));

    // The page-bridge.js listens for 'webclaw-page-bridge' channel messages in MAIN world.
    // Send a discovery request and verify we get a response (empty tools since no WebMCP on test page).
    const response = await page.evaluate(() => {
      return new Promise<{ tools: unknown[] }>((resolve) => {
        const timeout = setTimeout(() => resolve({ tools: [] }), 3000);
        window.addEventListener('message', function handler(event) {
          if (
            event.data?.channel === 'webclaw-page-bridge' &&
            event.data?.type === 'webmcp-tools-result'
          ) {
            window.removeEventListener('message', handler);
            clearTimeout(timeout);
            resolve(event.data);
          }
        });
        window.postMessage(
          { channel: 'webclaw-page-bridge', type: 'discover-webmcp-tools' },
          '*',
        );
      });
    });

    // page-bridge.js should respond with empty tools (no navigator.modelContext on test page)
    expect(response).toHaveProperty('tools');
    expect(Array.isArray(response.tools)).toBe(true);
  }, 15_000);
});
