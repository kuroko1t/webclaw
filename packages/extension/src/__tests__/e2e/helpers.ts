/**
 * E2E test helpers – launch Chrome with the extension loaded and communicate
 * with the content script via the service worker.
 */
import puppeteer, { type Browser, type Page, type WebWorker } from 'puppeteer-core';
import { resolve } from 'path';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http';
import { readFileSync } from 'fs';

/** Absolute path to the built extension */
const DIST_PATH = resolve(__dirname, '../../../dist');

/**
 * Locate a Chrome / Chromium executable that supports `--load-extension`.
 *
 * The official Google Chrome build disables `--load-extension` and
 * `--disable-extensions-except` so we need Chrome for Testing or Chromium.
 */
function findChrome(): string {
  const candidates = [
    process.env.CHROME_PATH,
    // Chrome for Testing installed via @puppeteer/browsers
    ...findChromeForTesting(),
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    // Fallback – may fail at runtime if it's official Chrome
    '/usr/bin/google-chrome-stable',
  ];
  for (const c of candidates) {
    if (c) {
      try {
        readFileSync(c);
        return c;
      } catch {
        continue;
      }
    }
  }
  throw new Error(
    'Chrome for Testing not found. Install via: npx @puppeteer/browsers install chrome@stable --path /tmp/chrome-for-testing',
  );
}

/** Glob for Chrome for Testing binaries in /tmp */
function findChromeForTesting(): string[] {
  const { execSync } = require('child_process');
  try {
    const result = execSync(
      'find /tmp/chrome-for-testing -name chrome -type f 2>/dev/null',
      { encoding: 'utf8', timeout: 3000 },
    );
    return result.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Launch Chrome with the extension loaded in headless=new mode.
 *
 * Puppeteer's default args include `--disable-extensions` and
 * `--disable-component-extensions-with-background-pages` which prevent
 * extension loading. We strip them via `ignoreDefaultArgs` and pass
 * `--headless=new` manually so Chrome runs the full browser in headless
 * mode with extension support.
 */
export async function launchBrowserWithExtension(): Promise<Browser> {
  return puppeteer.launch({
    headless: false,
    executablePath: findChrome(),
    ignoreDefaultArgs: [
      '--disable-extensions',
      '--disable-component-extensions-with-background-pages',
    ],
    args: [
      '--headless=new',
      `--disable-extensions-except=${DIST_PATH}`,
      `--load-extension=${DIST_PATH}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
    ],
  });
}

/**
 * Get the service worker WebWorker instance for our extension.
 */
export async function getServiceWorker(browser: Browser): Promise<WebWorker> {
  const swTarget = await browser.waitForTarget(
    (t) =>
      t.type() === 'service_worker' &&
      t.url().includes('background/service-worker'),
    { timeout: 20_000 },
  );
  const worker = await swTarget.worker();
  if (!worker) throw new Error('Could not get service worker');
  return worker;
}

/**
 * Extract the extension ID from the service worker target URL.
 */
export async function getExtensionId(browser: Browser): Promise<string> {
  const swTarget = await browser.waitForTarget(
    (t) =>
      t.type() === 'service_worker' &&
      t.url().includes('background/service-worker'),
    { timeout: 20_000 },
  );
  const url = swTarget.url();
  const match = url.match(/chrome-extension:\/\/([a-z]+)\//);
  if (!match) throw new Error(`Cannot extract extension ID from: ${url}`);
  return match[1];
}

/**
 * Find the Chrome tab ID for a page by matching its URL.
 */
async function findTabId(worker: WebWorker, pageUrl: string): Promise<number | null> {
  const tabs: Array<{ id: number; url: string }> = await worker.evaluate(async () => {
    return (await chrome.tabs.query({})).map((t: any) => ({ id: t.id, url: t.url }));
  });
  const tab = tabs.find((t) => t.url === pageUrl);
  return tab?.id ?? null;
}

/**
 * Send a message to the content script via the service worker.
 *
 * Puppeteer's page context lives in the MAIN world, but the content script
 * runs in an ISOLATED world. We go through the service worker which uses
 * chrome.tabs.sendMessage.
 */
export async function sendToContentScript(
  browser: Browser,
  page: Page,
  message: Record<string, unknown>,
): Promise<any> {
  const worker = await getServiceWorker(browser);
  const tabId = await findTabId(worker, page.url());
  if (!tabId) throw new Error(`Tab not found for URL: ${page.url()}`);

  return worker.evaluate(
    async (id: number, msg: Record<string, unknown>) => {
      return chrome.tabs.sendMessage(id, {
        channel: 'webclaw-action',
        ...msg,
      });
    },
    tabId,
    message,
  );
}

/**
 * Open a page and wait for the content script to be ready (responds to ping).
 */
export async function openPageAndWaitForContentScript(
  browser: Browser,
  page: Page,
  url: string,
  { timeout = 15_000 }: { timeout?: number } = {},
): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  const worker = await getServiceWorker(browser);
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const tabId = await findTabId(worker, page.url());
      if (tabId) {
        const result = await worker.evaluate(
          async (id: number) => {
            return chrome.tabs.sendMessage(id, {
              channel: 'webclaw-action',
              action: 'ping',
            });
          },
          tabId,
        );
        if (result?.pong) return;
      }
    } catch {
      // Content script not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Content script did not respond within ${timeout}ms`);
}

/**
 * Start a minimal HTTP server that serves HTML pages for tests.
 *
 * Content scripts only inject into http(s) pages (not data: or file:),
 * so we need a local server.
 */
export function startTestServer(
  pages: Record<string, string>,
): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const path = req.url || '/';
      const html = pages[path];
      if (html) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Could not get server address'));
        return;
      }
      resolve({ server, port: addr.port });
    });

    server.on('error', reject);
  });
}

/**
 * Start an HTTP server that serves static files from a directory.
 */
export function startStaticServer(
  rootDir: string,
): Promise<{ server: Server; port: number }> {
  const fs = require('fs');
  const nodePath = require('path');

  return new Promise((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const urlPath = req.url === '/' ? '/index.html' : req.url || '/index.html';
      const filePath = nodePath.join(rootDir, urlPath);
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const ext = nodePath.extname(filePath);
        const contentType =
          ext === '.html'
            ? 'text/html; charset=utf-8'
            : ext === '.js'
              ? 'application/javascript'
              : 'text/plain';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Could not get server address'));
        return;
      }
      resolve({ server, port: addr.port });
    });

    server.on('error', reject);
  });
}
