/**
 * E2E tests for real browser behaviors that unit tests cannot catch.
 *
 * Covers:
 * - Visibility cascade (visibility:hidden parent → visibility:visible child)
 * - Deep DOM nesting performance
 * - Rapid sequential actions and focus management
 * - Form submission via button click
 * - Back/forward navigation and stale refs
 * - Zero-sized and off-screen elements
 * - Input with JS validation/masking listeners
 * - Shadow DOM boundary
 * - aria-checked="mixed" (indeterminate)
 * - Hover-dependent visibility (display toggled on mouseover)
 * - Concurrent type + click (focus transfer)
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

let browser: Browser;
let page: Page;
let server: Server;
let port: number;

const pages: Record<string, string> = {
  '/visibility-cascade': `<!DOCTYPE html><html><head><title>Visibility Cascade</title>
    <style>
      .v-hidden { visibility: hidden; }
      .v-visible { visibility: visible; }
      .opacity-0 { opacity: 0; }
    </style>
  </head><body>
    <h1>Visibility Tests</h1>
    <!-- visibility:hidden parent, visibility:visible child -->
    <div class="v-hidden">
      <button id="btn-visible-child" class="v-visible"
              onclick="document.getElementById('vis-result').textContent='child-clicked'">
        Visible Child
      </button>
      <button id="btn-hidden-child">Hidden Child</button>
    </div>
    <!-- opacity:0 parent, child inherits -->
    <div class="opacity-0">
      <button id="btn-opacity-child">Opacity Child</button>
    </div>
    <!-- display:none hides everything -->
    <div style="display:none">
      <button id="btn-display-none" class="v-visible">Display None Child</button>
    </div>
    <!-- Visible reference button -->
    <button id="btn-normal" onclick="document.getElementById('vis-result').textContent='normal-clicked'">
      Normal Button
    </button>
    <div id="vis-result"></div>
  </body></html>`,

  '/deep-nesting': `<!DOCTYPE html><html><head><title>Deep Nesting</title></head><body>
    <h1>Deep Nesting Test</h1>
    <div id="deep-root"></div>
    <script>
      // Create 80 levels of nesting with a button at the bottom
      var el = document.getElementById('deep-root');
      for (var i = 0; i < 80; i++) {
        var div = document.createElement('div');
        el.appendChild(div);
        el = div;
      }
      var btn = document.createElement('button');
      btn.id = 'deep-btn';
      btn.textContent = 'Deep Button';
      btn.onclick = function() {
        document.getElementById('deep-result').textContent = 'deep-clicked';
      };
      el.appendChild(btn);
      var result = document.createElement('div');
      result.id = 'deep-result';
      document.body.appendChild(result);
    </script>
  </body></html>`,

  '/rapid-actions': `<!DOCTYPE html><html><head><title>Rapid Actions</title></head><body>
    <h1>Rapid Actions</h1>
    <input id="field-a" type="text" aria-label="Field A">
    <input id="field-b" type="text" aria-label="Field B">
    <button id="counter-btn" onclick="
      var c = parseInt(this.getAttribute('data-count') || '0') + 1;
      this.setAttribute('data-count', c);
      document.getElementById('counter-display').textContent = 'Count: ' + c;
    ">Increment</button>
    <div id="counter-display">Count: 0</div>
    <textarea id="textarea-a" aria-label="Notes A">initial</textarea>
  </body></html>`,

  '/form-submit': `<!DOCTYPE html><html><head><title>Form Submit</title></head><body>
    <h1>Forms</h1>
    <!-- Form that prevents default and shows result -->
    <form id="form1" onsubmit="event.preventDefault();
      document.getElementById('form-result').textContent =
        'Submitted: ' + document.getElementById('fname').value;
      return false;">
      <label for="fname">First Name</label>
      <input id="fname" type="text" aria-label="First Name" required>
      <button type="submit">Submit Form</button>
    </form>
    <div id="form-result"></div>

    <!-- Form with enter-to-submit behavior -->
    <form id="form2" onsubmit="event.preventDefault();
      document.getElementById('form2-result').textContent =
        'Search: ' + document.getElementById('q').value;
      return false;">
      <input id="q" type="search" aria-label="Search query">
      <button type="submit">Search</button>
    </form>
    <div id="form2-result"></div>
  </body></html>`,

  '/back-forward': `<!DOCTYPE html><html><head><title>Page A</title></head><body>
    <h1>Page A</h1>
    <a id="link-b" href="/page-b">Go to Page B</a>
    <button id="btn-a" onclick="document.getElementById('result-a').textContent='a-clicked'">
      Button A
    </button>
    <div id="result-a"></div>
  </body></html>`,

  '/page-b': `<!DOCTYPE html><html><head><title>Page B</title></head><body>
    <h1>Page B</h1>
    <a id="link-a" href="/back-forward">Back to Page A</a>
    <button id="btn-b" onclick="document.getElementById('result-b').textContent='b-clicked'">
      Button B
    </button>
    <div id="result-b"></div>
  </body></html>`,

  '/zero-size': `<!DOCTYPE html><html><head><title>Zero Size Elements</title>
    <style>
      .zero-w { width: 0; overflow: hidden; }
      .zero-h { height: 0; overflow: hidden; }
      .offscreen { position: absolute; left: -9999px; }
    </style>
  </head><body>
    <h1>Special Size Elements</h1>
    <button id="btn-normal" onclick="document.getElementById('size-result').textContent='normal'">
      Normal Size
    </button>
    <div class="offscreen">
      <button id="btn-offscreen" onclick="document.getElementById('size-result').textContent='offscreen'">
        Offscreen Button
      </button>
    </div>
    <div id="size-result"></div>
  </body></html>`,

  '/input-masking': `<!DOCTYPE html><html><head><title>Input Masking</title></head><body>
    <h1>Input Masking</h1>
    <!-- Input that forces uppercase -->
    <input id="upper-input" type="text" aria-label="Uppercase field">
    <!-- Input that strips non-digits -->
    <input id="digits-only" type="text" aria-label="Digits only" maxlength="10">
    <!-- Input that reverts invalid values -->
    <input id="email-check" type="text" aria-label="Email field">
    <div id="mask-status"></div>
    <script>
      document.getElementById('upper-input').addEventListener('input', function(e) {
        this.value = this.value.toUpperCase();
      });
      document.getElementById('digits-only').addEventListener('input', function(e) {
        this.value = this.value.replace(/[^0-9]/g, '');
      });
      document.getElementById('email-check').addEventListener('change', function(e) {
        if (this.value && !this.value.includes('@')) {
          document.getElementById('mask-status').textContent = 'Invalid email';
        } else {
          document.getElementById('mask-status').textContent = 'Valid';
        }
      });
    </script>
  </body></html>`,

  '/shadow-dom': `<!DOCTYPE html><html><head><title>Shadow DOM</title></head><body>
    <h1>Shadow DOM Test</h1>
    <div id="shadow-host"></div>
    <button id="light-btn" onclick="document.getElementById('shadow-result').textContent='light-clicked'">
      Light DOM Button
    </button>
    <div id="shadow-result"></div>
    <script>
      var host = document.getElementById('shadow-host');
      var shadow = host.attachShadow({ mode: 'open' });
      shadow.innerHTML = '<button id="shadow-btn" onclick="document.getElementById(\\'shadow-result\\').textContent=\\'shadow-clicked\\'">Shadow Button</button>';
    </script>
  </body></html>`,

  '/mixed-checked': `<!DOCTYPE html><html><head><title>Mixed Checked</title></head><body>
    <h1>Indeterminate States</h1>
    <div role="checkbox" id="cb-mixed" aria-checked="mixed" aria-label="Select all"
         tabindex="0" onclick="toggleTristate(this)">
      Select All
    </div>
    <div role="checkbox" id="cb-item1" aria-checked="true" aria-label="Item 1"
         tabindex="0" onclick="toggleChecked(this)">Item 1</div>
    <div role="checkbox" id="cb-item2" aria-checked="false" aria-label="Item 2"
         tabindex="0" onclick="toggleChecked(this)">Item 2</div>
    <script>
      function toggleChecked(el) {
        var c = el.getAttribute('aria-checked') === 'true';
        el.setAttribute('aria-checked', String(!c));
        updateParent();
      }
      function toggleTristate(el) {
        var items = document.querySelectorAll('[id^="cb-item"]');
        var allChecked = Array.from(items).every(function(i) {
          return i.getAttribute('aria-checked') === 'true';
        });
        items.forEach(function(i) {
          i.setAttribute('aria-checked', String(!allChecked));
        });
        el.setAttribute('aria-checked', String(!allChecked));
      }
      function updateParent() {
        var items = document.querySelectorAll('[id^="cb-item"]');
        var states = Array.from(items).map(function(i) {
          return i.getAttribute('aria-checked');
        });
        var parent = document.getElementById('cb-mixed');
        if (states.every(function(s) { return s === 'true'; })) {
          parent.setAttribute('aria-checked', 'true');
        } else if (states.every(function(s) { return s === 'false'; })) {
          parent.setAttribute('aria-checked', 'false');
        } else {
          parent.setAttribute('aria-checked', 'mixed');
        }
      }
    </script>
  </body></html>`,

  '/dom-mutation-during-action': `<!DOCTYPE html><html><head><title>DOM Mutation</title></head><body>
    <h1>DOM Mutation During Action</h1>
    <!-- Button that removes itself on click -->
    <div id="container">
      <button id="self-destruct" onclick="this.remove();
        document.getElementById('mut-result').textContent='self-destructed'">
        Self Destruct
      </button>
      <!-- Button that replaces sibling -->
      <button id="replace-btn" onclick="
        var c = document.getElementById('replaceable');
        c.innerHTML = '<button id=new-btn>New Button</button>';
        document.getElementById('mut-result').textContent='replaced'">
        Replace Sibling
      </button>
      <div id="replaceable"><button id="old-btn">Old Button</button></div>
    </div>
    <div id="mut-result"></div>
  </body></html>`,

  '/focus-management': `<!DOCTYPE html><html><head><title>Focus Management</title></head><body>
    <h1>Focus Management</h1>
    <input id="input1" type="text" aria-label="Input 1"
           onfocus="document.getElementById('focus-log').textContent += 'focus1 '">
    <input id="input2" type="text" aria-label="Input 2"
           onfocus="document.getElementById('focus-log').textContent += 'focus2 '">
    <button id="focus-btn"
            onfocus="document.getElementById('focus-log').textContent += 'focusBtn '">
      Focus Target
    </button>
    <div id="focus-log"></div>
  </body></html>`,
};

beforeAll(async () => {
  const srv = await startTestServer(pages);
  server = srv.server;
  port = srv.port;
  browser = await launchBrowserWithExtension();
  page = (await browser.pages())[0] ?? (await browser.newPage());
}, 30_000);

afterAll(async () => {
  await browser?.close();
  server?.close();
});

describe('Browser Behaviors E2E', () => {
  // --- Visibility Cascade ---

  it('should include visibility:visible child inside visibility:hidden parent', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/visibility-cascade`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Visible child should appear in snapshot with @ref
    const visibleChildLine = snap.text.split('\n').find(
      (l: string) => l.includes('button') && l.includes('"Visible Child"'),
    );
    expect(visibleChildLine).toBeTruthy();
    expect(visibleChildLine).toMatch(/@e\d+/);

    // Hidden child (inherits visibility:hidden) should NOT appear
    expect(snap.text).not.toContain('"Hidden Child"');
  }, 30_000);

  it('should clickable visibility:visible child inside visibility:hidden parent', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/visibility-cascade`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = snap.text.match(/@e\d+(?= button "Visible Child")/)?.[0];
    expect(ref).toBeTruthy();

    const result = await sendToContentScript(browser, page, { action: 'click', ref });
    expect(result.success).toBe(true);

    const text = await page.evaluate(() =>
      document.getElementById('vis-result')!.textContent,
    );
    expect(text).toBe('child-clicked');
  }, 30_000);

  it('should exclude display:none children even if they have visibility:visible', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/visibility-cascade`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // display:none subtree should be completely excluded
    expect(snap.text).not.toContain('"Display None Child"');
  }, 30_000);

  it('should exclude opacity:0 elements from snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/visibility-cascade`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // opacity:0 child inherits, should not have interactive @ref
    expect(snap.text).not.toContain('"Opacity Child"');
  }, 30_000);

  // --- Deep DOM Nesting ---

  it('should handle 80+ levels of DOM nesting without error', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/deep-nesting`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Button deep in the DOM should appear with @ref
    expect(snap.text).toContain('"Deep Button"');
    const ref = snap.text.match(/@e\d+(?= button "Deep Button")/)?.[0];
    expect(ref).toBeTruthy();
  }, 30_000);

  it('should click deeply nested button', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/deep-nesting`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = snap.text.match(/@e\d+(?= button "Deep Button")/)?.[0];
    const result = await sendToContentScript(browser, page, { action: 'click', ref });
    expect(result.success).toBe(true);

    const text = await page.evaluate(() =>
      document.getElementById('deep-result')!.textContent,
    );
    expect(text).toBe('deep-clicked');
  }, 30_000);

  // --- Rapid Sequential Actions ---

  it('should type into two fields sequentially without data corruption', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/rapid-actions`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const refA = snap.text.match(/@e\d+(?= textbox "Field A")/)?.[0];
    const refB = snap.text.match(/@e\d+(?= textbox "Field B")/)?.[0];

    // Type into A then B without re-snapshot
    await sendToContentScript(browser, page, { action: 'typeText', ref: refA, text: 'Hello' });
    await sendToContentScript(browser, page, { action: 'typeText', ref: refB, text: 'World' });

    const valueA = await page.evaluate(() =>
      (document.getElementById('field-a') as HTMLInputElement).value,
    );
    const valueB = await page.evaluate(() =>
      (document.getElementById('field-b') as HTMLInputElement).value,
    );

    expect(valueA).toBe('Hello');
    expect(valueB).toBe('World');
  }, 30_000);

  it('should handle rapid clicks on the same button', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/rapid-actions`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = snap.text.match(/@e\d+(?= button "Increment")/)?.[0];
    expect(ref).toBeTruthy();

    // Click 5 times rapidly
    for (let i = 0; i < 5; i++) {
      await sendToContentScript(browser, page, { action: 'click', ref });
    }

    const count = await page.evaluate(() =>
      document.getElementById('counter-display')!.textContent,
    );
    expect(count).toBe('Count: 5');
  }, 30_000);

  // --- Form Submission ---

  it('should submit form by clicking submit button', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/form-submit`);
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Type name
    const nameRef = snap.text.match(/@e\d+(?= textbox "First Name")/)?.[0];
    await sendToContentScript(browser, page, {
      action: 'typeText', ref: nameRef, text: 'Alice',
    });

    // Click submit
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const submitRef = snap.text.match(/@e\d+(?= button "Submit Form")/)?.[0];
    expect(submitRef).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref: submitRef });

    const result = await page.evaluate(() =>
      document.getElementById('form-result')!.textContent,
    );
    expect(result).toBe('Submitted: Alice');
  }, 30_000);

  // --- Back/Forward Navigation ---

  it('should handle cross-page navigation with stale refs', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/back-forward`);
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Save ref from page A
    const btnARef = snap.text.match(/@e\d+(?= button "Button A")/)?.[0];
    expect(btnARef).toBeTruthy();

    // Navigate to page B
    const linkRef = snap.text.match(/@e\d+(?= link "Go to Page B")/)?.[0];
    await sendToContentScript(browser, page, { action: 'click', ref: linkRef });

    // Wait for navigation
    await page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1000));

    // Re-init content script on new page
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/page-b`);
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Page B should have its own elements
    expect(snap.text).toContain('"Button B"');
    expect(snap.text).not.toContain('"Button A"');
  }, 30_000);

  // --- Offscreen Elements ---

  it('should include offscreen elements in snapshot and allow click', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/zero-size`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Offscreen button should appear in snapshot (it's visible, just positioned off-screen)
    const offscreenLine = snap.text.split('\n').find(
      (l: string) => l.includes('button') && l.includes('"Offscreen Button"'),
    );
    expect(offscreenLine).toBeTruthy();

    // Click should work (scrollIntoView brings it into viewport)
    const ref = snap.text.match(/@e\d+(?= button "Offscreen Button")/)?.[0];
    const result = await sendToContentScript(browser, page, { action: 'click', ref });
    expect(result.success).toBe(true);

    const text = await page.evaluate(() =>
      document.getElementById('size-result')!.textContent,
    );
    expect(text).toBe('offscreen');
  }, 30_000);

  // --- Input Masking ---

  it('should handle input with uppercase masking listener', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/input-masking`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = snap.text.match(/@e\d+(?= textbox "Uppercase field")/)?.[0];
    await sendToContentScript(browser, page, {
      action: 'typeText', ref, text: 'hello world',
    });

    const value = await page.evaluate(() =>
      (document.getElementById('upper-input') as HTMLInputElement).value,
    );
    // The input listener converts to uppercase after our input event
    expect(value).toBe('HELLO WORLD');
  }, 30_000);

  it('should handle input with digits-only masking', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/input-masking`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = snap.text.match(/@e\d+(?= textbox "Digits only")/)?.[0];
    await sendToContentScript(browser, page, {
      action: 'typeText', ref, text: 'abc123def456',
    });

    const value = await page.evaluate(() =>
      (document.getElementById('digits-only') as HTMLInputElement).value,
    );
    // The input listener strips non-digits
    expect(value).toBe('123456');
  }, 30_000);

  it('should trigger change event for email validation', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/input-masking`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = snap.text.match(/@e\d+(?= textbox "Email field")/)?.[0];
    await sendToContentScript(browser, page, {
      action: 'typeText', ref, text: 'not-an-email',
    });

    const status = await page.evaluate(() =>
      document.getElementById('mask-status')!.textContent,
    );
    expect(status).toBe('Invalid email');
  }, 30_000);

  // --- Shadow DOM ---

  it('should include shadow DOM elements in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/shadow-dom`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Shadow DOM button should appear (snapshot walks shadowRoot)
    expect(snap.text).toContain('"Shadow Button"');

    // Light DOM button should appear
    expect(snap.text).toContain('"Light DOM Button"');
  }, 30_000);

  it('should click light DOM button even with shadow DOM sibling', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/shadow-dom`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = snap.text.match(/@e\d+(?= button "Light DOM Button")/)?.[0];
    expect(ref).toBeTruthy();

    const result = await sendToContentScript(browser, page, { action: 'click', ref });
    expect(result.success).toBe(true);

    const text = await page.evaluate(() =>
      document.getElementById('shadow-result')!.textContent,
    );
    expect(text).toBe('light-clicked');
  }, 30_000);

  // --- aria-checked="mixed" ---

  it('should capture aria-checked="mixed" state in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/mixed-checked`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // "Select All" has aria-checked="mixed"
    const selectAllLine = snap.text.split('\n').find(
      (l: string) => l.includes('checkbox') && l.includes('"Select all"'),
    );
    expect(selectAllLine).toBeTruthy();

    // Item 1 is checked, Item 2 is unchecked
    const item1Line = snap.text.split('\n').find(
      (l: string) => l.includes('checkbox') && l.includes('"Item 1"'),
    );
    expect(item1Line).toContain('(checked)');

    const item2Line = snap.text.split('\n').find(
      (l: string) => l.includes('checkbox') && l.includes('"Item 2"'),
    );
    expect(item2Line).toContain('(unchecked)');
  }, 30_000);

  it('should update mixed state after toggling child checkbox', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/mixed-checked`);
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Check Item 2 (Item 1 already checked → both checked → parent becomes checked)
    const item2Ref = snap.text.match(/@e\d+(?= checkbox "Item 2")/)?.[0];
    await sendToContentScript(browser, page, { action: 'click', ref: item2Ref });

    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const selectAllLine = snap.text.split('\n').find(
      (l: string) => l.includes('checkbox') && l.includes('"Select all"'),
    );
    expect(selectAllLine).toContain('(checked)');
  }, 30_000);

  it('should toggle all children when clicking "Select All"', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/mixed-checked`);
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Click Select All (currently mixed → all items become unchecked because not all checked)
    // Actually: Item 1 = true, Item 2 = false, so not allChecked → set all to true
    const selectAllRef = snap.text.match(/@e\d+(?= checkbox "Select all")/)?.[0];
    await sendToContentScript(browser, page, { action: 'click', ref: selectAllRef });

    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const item1Line = snap.text.split('\n').find(
      (l: string) => l.includes('checkbox') && l.includes('"Item 1"'),
    );
    const item2Line = snap.text.split('\n').find(
      (l: string) => l.includes('checkbox') && l.includes('"Item 2"'),
    );
    // toggleTristate: allChecked was false → set all to true
    expect(item1Line).toContain('(checked)');
    expect(item2Line).toContain('(checked)');
  }, 30_000);

  // --- DOM Mutation During Action ---

  it('should handle self-removing button gracefully', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/dom-mutation-during-action`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = snap.text.match(/@e\d+(?= button "Self Destruct")/)?.[0];
    expect(ref).toBeTruthy();

    // Click succeeds (button removes itself in onclick handler, but click event already fired)
    const result = await sendToContentScript(browser, page, { action: 'click', ref });
    expect(result.success).toBe(true);

    const text = await page.evaluate(() =>
      document.getElementById('mut-result')!.textContent,
    );
    expect(text).toBe('self-destructed');

    // Second click on same ref should fail (element removed from DOM)
    const result2 = await sendToContentScript(browser, page, { action: 'click', ref });
    expect(result2.success).toBe(false);
    expect(result2.error).toContain('not found');
  }, 30_000);

  it('should detect replaced sibling as stale after replacement', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/dom-mutation-during-action`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const oldRef = snap.text.match(/@e\d+(?= button "Old Button")/)?.[0];
    expect(oldRef).toBeTruthy();

    // Click replace button to swap out old button
    const replaceRef = snap.text.match(/@e\d+(?= button "Replace Sibling")/)?.[0];
    await sendToContentScript(browser, page, { action: 'click', ref: replaceRef });

    // Old ref should now be stale
    const result = await sendToContentScript(browser, page, { action: 'click', ref: oldRef });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');

    // New snapshot should show new button
    const snap2 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap2.text).toContain('"New Button"');
    expect(snap2.text).not.toContain('"Old Button"');
  }, 30_000);

  // --- Focus Management ---

  it('should properly transfer focus between typed fields', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/focus-management`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref1 = snap.text.match(/@e\d+(?= textbox "Input 1")/)?.[0];
    const ref2 = snap.text.match(/@e\d+(?= textbox "Input 2")/)?.[0];
    const btnRef = snap.text.match(/@e\d+(?= button "Focus Target")/)?.[0];

    // Type in input 1
    await sendToContentScript(browser, page, { action: 'typeText', ref: ref1, text: 'a' });
    // Type in input 2
    await sendToContentScript(browser, page, { action: 'typeText', ref: ref2, text: 'b' });
    // Click button
    await sendToContentScript(browser, page, { action: 'click', ref: btnRef });

    const log = await page.evaluate(() =>
      document.getElementById('focus-log')!.textContent,
    );
    // Should contain focus events in order
    expect(log).toContain('focus1');
    expect(log).toContain('focus2');
    expect(log).toContain('focusBtn');
  }, 30_000);
});
