/**
 * E2E tests (content script level) for:
 * - type_text keeping newlines as text unless pressKeys is set
 * - drop_files using only a file input near the target, otherwise
 *   falling back to drag-and-drop
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Browser, Page } from 'puppeteer-core';
import type { Server } from 'http';
import {
  launchBrowserWithExtension,
  openPageAndWaitForContentScript,
  sendToContentScript,
  startTestServer,
} from './helpers';

const PNG_FILE = { name: 'a.png', mimeType: 'image/png', base64Data: 'iVBORw0KGgo=' };

describe('type_text pressKeys and drop_files E2E', () => {
  let browser: Browser;
  let page: Page;
  let server: Server;
  let port: number;

  const TEST_PAGES: Record<string, string> = {
    '/keys': `<!DOCTYPE html><html><head><title>Keys</title></head><body>
      <form id="f" onsubmit="event.preventDefault(); document.title = 'submitted';">
        <textarea id="notes" aria-label="Notes"></textarea>
      </form>
    </body></html>`,

    '/upload': `<!DOCTYPE html><html><head><title>Upload</title></head><body>
      <header><div><div><input type="file" id="avatar" aria-label="Avatar"></div></div></header>
      <main><div><div><div><div><div><div>
        <button id="zone" aria-label="Drop zone">Drop files here</button>
      </div></div></div></div></div></div></main>
      <div role="dialog" aria-label="Upload dialog">
        <button id="select" aria-label="Select files">Select files</button>
        <input type="file" id="dialog-input" accept="image/*" style="display:none">
      </div>
      <script>
        window.dropped = 0;
        document.getElementById('zone').addEventListener('drop', function () { window.dropped++; });
      </script>
    </body></html>`,
  };

  beforeAll(async () => {
    const srv = await startTestServer(TEST_PAGES);
    server = srv.server;
    port = srv.port;
    browser = await launchBrowserWithExtension();
    page = (await browser.pages())[0] ?? (await browser.newPage());
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
    server?.close();
  });

  it('inserts multi-line text as the value without pressKeys', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/keys`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const ref = snap.text.match(/@e\d+(?= textbox "Notes")/)?.[0];
    expect(ref).toBeTruthy();

    const result = await sendToContentScript(browser, page, {
      action: 'typeText', ref, text: 'line1\nline2',
    });
    expect(result).toEqual({ success: true });
    const value = await page.evaluate(
      () => (document.getElementById('notes') as HTMLTextAreaElement).value
    );
    expect(value).toBe('line1\nline2');
    expect(await page.title()).toBe('Keys');
  }, 30_000);

  it('asks for trusted key presses only with pressKeys', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/keys`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const ref = snap.text.match(/@e\d+(?= textbox "Notes")/)?.[0];

    const result = await sendToContentScript(browser, page, {
      action: 'typeText', ref, text: 'a\nb', pressKeys: true,
    });
    expect(result).toMatchObject({ success: true, needsTrustedInput: true });
  }, 30_000);

  it('falls back to drag-and-drop when only an unrelated file input exists', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/upload`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const ref = snap.text.match(/@e\d+(?= button "Drop zone")/)?.[0];
    expect(ref).toBeTruthy();

    const result = await sendToContentScript(browser, page, {
      action: 'dropFiles', ref, files: [PNG_FILE],
    });
    expect(result).toEqual({ success: true, method: 'drag-and-drop' });
    const state = await page.evaluate(() => ({
      dropped: (window as unknown as { dropped: number }).dropped,
      avatarFiles: (document.getElementById('avatar') as HTMLInputElement).files!.length,
    }));
    expect(state).toEqual({ dropped: 1, avatarFiles: 0 });
  }, 30_000);

  it('sets the files of the file input in the same dialog', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/upload`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const ref = snap.text.match(/@e\d+(?= button "Select files")/)?.[0];
    expect(ref).toBeTruthy();

    const result = await sendToContentScript(browser, page, {
      action: 'dropFiles', ref, files: [PNG_FILE],
    });
    expect(result).toEqual({ success: true, method: 'nearest-file-input' });
    const name = await page.evaluate(
      () => (document.getElementById('dialog-input') as HTMLInputElement).files![0]?.name
    );
    expect(name).toBe('a.png');
  }, 30_000);
});
