/**
 * E2E: Content Script Injection
 *
 * Verifies that the extension loads, the service worker starts, and the
 * content script is injected into pages and responds to messages.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Browser } from 'puppeteer-core';
import type { Server } from 'http';
import {
  launchBrowserWithExtension,
  getExtensionId,
  sendToContentScript,
  openPageAndWaitForContentScript,
  startTestServer,
} from './helpers';

describe('Content Script Injection', () => {
  let browser: Browser;
  let extensionId: string;
  let server: Server;
  let port: number;

  beforeAll(async () => {
    ({ server, port } = await startTestServer({
      '/': '<html><body><h1>Hello</h1></body></html>',
      '/bridge': '<html><body><h1>Bridge Test</h1></body></html>',
    }));
    browser = await launchBrowserWithExtension();
    extensionId = await getExtensionId(browser);
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
    server?.close();
  });

  it('should load the extension and start the service worker', async () => {
    expect(extensionId).toMatch(/^[a-z]{32}$/);
  });

  it('should inject content script and respond to ping', async () => {
    const page = await browser.newPage();
    try {
      await openPageAndWaitForContentScript(
        browser,
        page,
        `http://127.0.0.1:${port}/`,
      );

      const result = await sendToContentScript(browser, page, { action: 'ping' });
      expect(result).toEqual({ pong: true });
    } finally {
      await page.close();
    }
  }, 20_000);

  it('should inject page-bridge.js as web_accessible_resource', async () => {
    const page = await browser.newPage();
    try {
      await openPageAndWaitForContentScript(
        browser,
        page,
        `http://127.0.0.1:${port}/bridge`,
      );

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
    } finally {
      await page.close();
    }
  }, 20_000);
});
