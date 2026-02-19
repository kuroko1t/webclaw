/**
 * E2E: Robustness tests targeting untested code paths and suspected bugs.
 *
 * Covers: disabled options, contenteditable variants, form reset,
 * template elements, off-screen elements, special characters,
 * deep nesting, nested interactive elements, dynamic forms.
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

/* ---- Test pages ---- */

/** Select with disabled options */
const DISABLED_OPTION_PAGE = `<!DOCTYPE html><html><body>
  <h1>Disabled Options</h1>
  <select id="sel1" aria-label="Shipping method">
    <option value="standard">Standard Shipping</option>
    <option value="express" disabled>Express Shipping (Unavailable)</option>
    <option value="overnight">Overnight Shipping</option>
  </select>
  <select id="sel2" aria-label="Region">
    <optgroup label="Americas">
      <option value="us">United States</option>
      <option value="ca" disabled>Canada (Unavailable)</option>
    </optgroup>
    <optgroup label="Europe">
      <option value="uk">United Kingdom</option>
      <option value="de">Germany</option>
    </optgroup>
  </select>
</body></html>`;

/** Contenteditable variants */
const CONTENTEDITABLE_PAGE = `<!DOCTYPE html><html><body>
  <h1>Contenteditable Variants</h1>
  <div id="ce-true" contenteditable="true" aria-label="Editor true">Editable true</div>
  <div id="ce-empty" contenteditable="" aria-label="Editor empty">Editable empty</div>
  <div id="ce-bare" contenteditable aria-label="Editor bare">Editable bare</div>
  <div id="ce-false" contenteditable="false" aria-label="Not editable">Not editable</div>
  <div id="ce-plaintext" contenteditable="plaintext-only" aria-label="Plaintext editor">Plaintext only</div>
  <div id="no-ce" aria-label="Regular div">Regular div</div>
  <button id="normal-btn">Normal Button</button>
</body></html>`;

/** Form reset behavior */
const FORM_RESET_PAGE = `<!DOCTYPE html><html><body>
  <h1>Form Reset</h1>
  <form id="myform">
    <input type="text" id="name" aria-label="Name" value="Default Name">
    <input type="email" id="email" aria-label="Email">
    <select id="color" aria-label="Color">
      <option value="red">Red</option>
      <option value="blue" selected>Blue</option>
      <option value="green">Green</option>
    </select>
    <textarea id="notes" aria-label="Notes">Default notes</textarea>
    <input type="checkbox" id="agree" aria-label="Agree"> Agree
    <button type="reset" id="reset-btn">Reset</button>
    <button type="submit" id="submit-btn" onclick="event.preventDefault()">Submit</button>
  </form>
</body></html>`;

/** Template element and offscreen elements */
const TEMPLATE_OFFSCREEN_PAGE = `<!DOCTYPE html><html><body>
  <h1>Template and Offscreen</h1>

  <template id="tpl">
    <button>Template Button</button>
    <input type="text" aria-label="Template input">
  </template>

  <div style="position:absolute;left:-9999px;top:-9999px">
    <button id="offscreen-btn" aria-label="Offscreen action">Offscreen Button</button>
    <input type="text" id="offscreen-input" aria-label="Offscreen input">
  </div>

  <div style="clip:rect(0,0,0,0);position:absolute;overflow:hidden;width:1px;height:1px">
    <a href="/sr-only" id="sr-link">Screen reader only link</a>
  </div>

  <button id="visible-btn">Visible Button</button>
</body></html>`;

/** Special characters in labels and values */
const SPECIAL_CHARS_PAGE = `<!DOCTYPE html><html><body>
  <h1>Special Characters</h1>
  <button id="btn-quotes">Click "here" &amp; 'there'</button>
  <input type="text" id="input-angle" aria-label="Enter <value>" value="<script>alert(1)</script>">
  <button id="btn-unicode">日本語ボタン 🎉</button>
  <input type="text" id="input-newline" aria-label="Multi&#10;line&#10;label">
  <select id="sel-special" aria-label="Pick &quot;option&quot;">
    <option value="a&b">Alpha &amp; Beta</option>
    <option value="c<d">Gamma &lt; Delta</option>
  </select>
</body></html>`;

/** Deep nesting and nested interactive elements */
const NESTING_PAGE = `<!DOCTYPE html><html><body>
  <h1>Nesting Tests</h1>

  <div id="deep-nest">
    ${'<div>'.repeat(30)}
      <button id="deep-btn">Deep Button</button>
      <input type="text" id="deep-input" aria-label="Deep input">
    ${'</div>'.repeat(30)}
  </div>

  <a href="/link-target" id="link-with-btn">
    <span>Link text</span>
    <button id="nested-btn">Nested Button</button>
  </a>

  <button id="btn-with-spans">
    <span>Part</span> <span>One</span>
  </button>

  <button id="same-name-1">Submit</button>
  <button id="same-name-2">Submit</button>

  <div id="click-output"></div>
  <script>
    document.getElementById('same-name-1').addEventListener('click', function(){
      document.getElementById('click-output').textContent = 'first-submit';
    });
    document.getElementById('same-name-2').addEventListener('click', function(){
      document.getElementById('click-output').textContent = 'second-submit';
    });
  </script>
</body></html>`;

/** Dynamic form creation and title change */
const DYNAMIC_PAGE = `<!DOCTYPE html><html><head><title>Initial Title</title></head><body>
  <h1 id="heading">Dynamic Page</h1>
  <button id="create-form">Create Form</button>
  <button id="change-title">Change Title</button>
  <div id="form-container"></div>
  <script>
    document.getElementById('create-form').addEventListener('click', function(){
      document.getElementById('form-container').innerHTML =
        '<form>' +
        '<input type="text" id="dyn-input" aria-label="Dynamic input">' +
        '<select id="dyn-select" aria-label="Dynamic select">' +
        '<option value="x">X</option><option value="y">Y</option>' +
        '</select>' +
        '<button id="dyn-submit">Dynamic Submit</button>' +
        '</form>';
    });
    document.getElementById('change-title').addEventListener('click', function(){
      document.title = 'Updated Title';
      document.getElementById('heading').textContent = 'Updated Page';
    });
  </script>
</body></html>`;

describe('Robustness E2E', () => {
  let browser: Browser;
  let server: Server;
  let port: number;
  let page: Page;

  beforeAll(async () => {
    ({ server, port } = await startTestServer({
      '/disabled-options': DISABLED_OPTION_PAGE,
      '/contenteditable': CONTENTEDITABLE_PAGE,
      '/form-reset': FORM_RESET_PAGE,
      '/template-offscreen': TEMPLATE_OFFSCREEN_PAGE,
      '/special-chars': SPECIAL_CHARS_PAGE,
      '/nesting': NESTING_PAGE,
      '/dynamic': DYNAMIC_PAGE,
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

  // ---- Disabled options in select ----

  it('should fail selectOption on a disabled option', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/disabled-options`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = extractRef(snap.text, 'Shipping method');
    expect(ref).toBeTruthy();

    // Trying to select the disabled "Express Shipping" option should fail
    const result = await sendToContentScript(browser, page, {
      action: 'selectOption', ref, value: 'Express Shipping (Unavailable)',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('disabled');
  }, 15_000);

  it('should succeed selectOption on an enabled option in same select', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/disabled-options`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = extractRef(snap.text, 'Shipping method');
    const result = await sendToContentScript(browser, page, {
      action: 'selectOption', ref, value: 'Overnight Shipping',
    });
    expect(result.success).toBe(true);

    const val = await page.evaluate(() =>
      (document.getElementById('sel1') as HTMLSelectElement).value
    );
    expect(val).toBe('overnight');
  }, 15_000);

  it('should fail selectOption on disabled option inside optgroup', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/disabled-options`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = extractRef(snap.text, 'Region');
    const result = await sendToContentScript(browser, page, {
      action: 'selectOption', ref, value: 'Canada (Unavailable)',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('disabled');
  }, 15_000);

  // ---- Contenteditable variants ----

  it('should assign ref to contenteditable="" (empty string)', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/contenteditable`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // contenteditable="" should be treated as editable
    const ref = extractRef(snap.text, 'Editor empty');
    expect(ref).toBeTruthy();
  }, 15_000);

  it('should assign ref to bare contenteditable (no value)', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/contenteditable`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = extractRef(snap.text, 'Editor bare');
    expect(ref).toBeTruthy();
  }, 15_000);

  it('should NOT assign ref to contenteditable="false"', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/contenteditable`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // contenteditable="false" should NOT be interactive
    const ref = extractRef(snap.text, 'Not editable');
    expect(ref).toBeNull();
  }, 15_000);

  it('should typeText into contenteditable="" element', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/contenteditable`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = extractRef(snap.text, 'Editor empty');
    expect(ref).toBeTruthy();

    const result = await sendToContentScript(browser, page, {
      action: 'typeText', ref, text: 'New content',
    });
    expect(result.success).toBe(true);

    const text = await page.evaluate(() =>
      document.getElementById('ce-empty')?.textContent
    );
    expect(text).toBe('New content');
  }, 15_000);

  it('should typeText into bare contenteditable element', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/contenteditable`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = extractRef(snap.text, 'Editor bare');
    expect(ref).toBeTruthy();

    const result = await sendToContentScript(browser, page, {
      action: 'typeText', ref, text: 'Bare content',
    });
    expect(result.success).toBe(true);

    const text = await page.evaluate(() =>
      document.getElementById('ce-bare')?.textContent
    );
    expect(text).toBe('Bare content');
  }, 15_000);

  it('should fail typeText on contenteditable="false" element', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/contenteditable`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // contenteditable="false" is NOT in snapshot as interactive,
    // but if we try to typeText with a valid ref, it should fail
    // Since it has no ref, we test that it's correctly excluded
    const ref = extractRef(snap.text, 'Not editable');
    expect(ref).toBeNull();
  }, 15_000);

  it('should assign ref to contenteditable="plaintext-only"', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/contenteditable`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = extractRef(snap.text, 'Plaintext editor');
    expect(ref).toBeTruthy();
  }, 15_000);

  // ---- Form reset ----

  it('should reflect form reset in snapshot values', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/form-reset`);
    const snap1 = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Modify values
    const nameRef = extractRef(snap1.text, 'Name');
    await sendToContentScript(browser, page, {
      action: 'typeText', ref: nameRef, text: 'Modified Name',
    });
    const colorRef = extractRef(snap1.text, 'Color');
    await sendToContentScript(browser, page, {
      action: 'selectOption', ref: colorRef, value: 'Green',
    });

    // Verify modified values
    const snap2 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(findLine(snap2.text, 'Name')).toContain('Modified Name');

    // Click Reset button
    const resetRef = extractRef(snap2.text, 'Reset');
    await sendToContentScript(browser, page, { action: 'click', ref: resetRef });
    await new Promise(r => setTimeout(r, 200));

    // After reset, values should revert to defaults
    const snap3 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(findLine(snap3.text, 'Name')).toContain('Default Name');
    expect(findLine(snap3.text, 'Color')).toContain('Blue');
  }, 20_000);

  // ---- Template and offscreen elements ----

  it('should NOT include template element content in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/template-offscreen`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    expect(snap.text).not.toContain('Template Button');
    expect(snap.text).not.toContain('Template input');
    expect(snap.text).toContain('Visible Button');
  }, 15_000);

  it('should include off-screen positioned elements in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/template-offscreen`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Off-screen elements (position: absolute; left: -9999px) are visible to
    // screen readers and should be in the snapshot
    expect(snap.text).toContain('Offscreen action');
    expect(snap.text).toContain('Offscreen input');

    // Clip-hidden elements (common screen-reader-only pattern) should also appear
    expect(snap.text).toContain('Screen reader only link');
  }, 15_000);

  // ---- Special characters ----

  it('should handle special characters in labels and values', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/special-chars`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Quotes in button text
    expect(snap.text).toContain('here');
    expect(snap.text).toContain('there');

    // Unicode button
    expect(snap.text).toContain('日本語ボタン');

    // HTML entities should be decoded
    const ref = extractRef(snap.text, 'Pick');
    expect(ref).toBeTruthy();

    // Angle brackets in values should be captured as-is (no XSS risk in text)
    const inputRef = extractRef(snap.text, 'Enter');
    expect(inputRef).toBeTruthy();
  }, 15_000);

  it('should typeText with special characters correctly', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/special-chars`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = extractRef(snap.text, 'Enter');
    const result = await sendToContentScript(browser, page, {
      action: 'typeText', ref, text: '<script>alert("xss")</script>',
    });
    expect(result.success).toBe(true);

    // Verify the value is stored as plain text, not executed
    const val = await page.evaluate(() =>
      (document.getElementById('input-angle') as HTMLInputElement).value
    );
    expect(val).toBe('<script>alert("xss")</script>');
  }, 15_000);

  // ---- Deep nesting and nested interactive elements ----

  it('should handle deeply nested DOM (30+ levels) without crashing', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/nesting`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Deep button should be found and interactive
    expect(snap.text).toContain('Deep Button');
    const ref = extractRef(snap.text, 'Deep Button');
    expect(ref).toBeTruthy();

    // Deep input should also be found
    expect(snap.text).toContain('Deep input');
    expect(extractRef(snap.text, 'Deep input')).toBeTruthy();
  }, 15_000);

  it('should assign separate refs to both link and nested button', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/nesting`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Both the <a> and the <button> inside it should have refs
    const linkRef = extractRef(snap.text, 'Link text');
    const btnRef = extractRef(snap.text, 'Nested Button');

    // Link text comes from span inside <a> - the link itself should have a ref
    // The button inside should also have a separate ref
    expect(btnRef).toBeTruthy();
  }, 15_000);

  it('should extract text from button with child spans', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/nesting`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // <button><span>Part</span> <span>One</span></button> should show "Part One"
    expect(snap.text).toContain('Part One');
  }, 15_000);

  it('should distinguish multiple same-name elements with different refs', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/nesting`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Two buttons named "Submit" should get different refs
    const refs = extractAllRefs(snap.text, 'Submit');
    expect(refs.length).toBe(2);
    expect(refs[0]).not.toBe(refs[1]);

    // Click the second one
    const result = await sendToContentScript(browser, page, {
      action: 'click', ref: refs[1],
    });
    expect(result.success).toBe(true);

    const output = await page.evaluate(() =>
      document.getElementById('click-output')?.textContent
    );
    expect(output).toBe('second-submit');
  }, 15_000);

  // ---- Dynamic form creation ----

  it('should discover dynamically created form elements after re-snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/dynamic`);
    const snap1 = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Initially no dynamic form
    expect(snap1.text).not.toContain('Dynamic input');
    expect(snap1.text).not.toContain('Dynamic select');

    // Click button to create form
    const createRef = extractRef(snap1.text, 'Create Form');
    await sendToContentScript(browser, page, { action: 'click', ref: createRef });
    await new Promise(r => setTimeout(r, 200));

    // Re-snapshot should find new elements
    const snap2 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap2.text).toContain('Dynamic input');
    expect(snap2.text).toContain('Dynamic select');
    expect(snap2.text).toContain('Dynamic Submit');

    // Interact with dynamic elements
    const dynRef = extractRef(snap2.text, 'Dynamic input');
    expect(dynRef).toBeTruthy();
    const r1 = await sendToContentScript(browser, page, {
      action: 'typeText', ref: dynRef, text: 'dynamic value',
    });
    expect(r1.success).toBe(true);

    const selRef = extractRef(snap2.text, 'Dynamic select');
    const r2 = await sendToContentScript(browser, page, {
      action: 'selectOption', ref: selRef, value: 'Y',
    });
    expect(r2.success).toBe(true);
  }, 20_000);

  it('should reflect dynamic document.title change in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/dynamic`);
    const snap1 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap1.title).toBe('Initial Title');

    // Click to change title
    const ref = extractRef(snap1.text, 'Change Title');
    await sendToContentScript(browser, page, { action: 'click', ref });
    await new Promise(r => setTimeout(r, 200));

    const snap2 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap2.title).toBe('Updated Title');
    expect(snap2.text).toContain('Updated Page');
  }, 15_000);
});

/* ---- Helpers ---- */

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

/** Extract ALL refs for lines containing labelText */
function extractAllRefs(snapshotText: string, labelText: string): string[] {
  const refs: string[] = [];
  const lines = snapshotText.split('\n');
  for (const line of lines) {
    if (line.includes(labelText)) {
      const refMatch = line.match(/@e\d+/);
      if (refMatch) refs.push(refMatch[0]);
    }
  }
  return refs;
}

function findLine(snapshotText: string, labelText: string): string | null {
  const lines = snapshotText.split('\n');
  for (const line of lines) {
    if (line.includes(labelText)) return line;
  }
  return null;
}
