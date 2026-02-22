/**
 * E2E tests for ARIA state capture and SVG/custom widget interactions.
 *
 * Covers:
 * - aria-pressed for toggle buttons
 * - aria-checked for custom checkboxes/switches
 * - SVG aria-disabled click rejection
 * - details/summary native toggle
 * - select[multiple] multi-selection
 * - readonly input behavior
 * - fieldset/legend accessible naming
 * - mixed label strategies
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
  '/toggle-buttons': `<!DOCTYPE html><html><head><title>Toggle Buttons</title></head><body>
    <h1>Toolbar</h1>
    <div role="toolbar" aria-label="Text formatting">
      <button id="bold-btn" aria-pressed="false" onclick="togglePressed(this)">Bold</button>
      <button id="italic-btn" aria-pressed="false" onclick="togglePressed(this)">Italic</button>
      <button id="underline-btn" aria-pressed="true" onclick="togglePressed(this)">Underline</button>
    </div>
    <script>
      function togglePressed(btn) {
        var current = btn.getAttribute('aria-pressed') === 'true';
        btn.setAttribute('aria-pressed', String(!current));
      }
    </script>
  </body></html>`,

  '/custom-checkboxes': `<!DOCTYPE html><html><head><title>Custom Checkboxes</title></head><body>
    <h1>Settings</h1>
    <div role="checkbox" id="cb-notifications" aria-checked="false" aria-label="Enable notifications"
         tabindex="0" onclick="toggleChecked(this)" style="cursor:pointer;">
      <span aria-hidden="true">&#x2610;</span> Enable notifications
    </div>
    <div role="checkbox" id="cb-darkmode" aria-checked="true" aria-label="Dark mode"
         tabindex="0" onclick="toggleChecked(this)" style="cursor:pointer;">
      <span aria-hidden="true">&#x2611;</span> Dark mode
    </div>
    <div role="switch" id="sw-autoplay" aria-checked="false" aria-label="Autoplay videos"
         tabindex="0" onclick="toggleChecked(this)" style="cursor:pointer;">
      Autoplay videos
    </div>
    <div id="status" role="status" aria-live="polite"></div>
    <script>
      function toggleChecked(el) {
        var current = el.getAttribute('aria-checked') === 'true';
        el.setAttribute('aria-checked', String(!current));
        var icon = el.querySelector('[aria-hidden]');
        if (icon) icon.textContent = current ? '\\u2610' : '\\u2611';
        document.getElementById('status').textContent =
          el.getAttribute('aria-label') + ': ' + (current ? 'off' : 'on');
      }
    </script>
  </body></html>`,

  '/svg-disabled': `<!DOCTYPE html><html><head><title>SVG Buttons</title></head><body>
    <h1>SVG Controls</h1>
    <svg role="button" id="svg-active" aria-label="Play" tabindex="0"
         width="40" height="40" onclick="document.getElementById('svg-result').textContent='played'">
      <circle cx="20" cy="20" r="18" fill="green"/>
    </svg>
    <svg role="button" id="svg-disabled" aria-label="Pause" aria-disabled="true" tabindex="0"
         width="40" height="40" onclick="document.getElementById('svg-result').textContent='paused'">
      <circle cx="20" cy="20" r="18" fill="gray"/>
    </svg>
    <div id="svg-result"></div>
  </body></html>`,

  '/details-summary': `<!DOCTYPE html><html><head><title>Details/Summary</title></head><body>
    <h1>FAQ</h1>
    <details id="faq1">
      <summary>What is hermitclaw?</summary>
      <p>A browser extension for LLM-based web navigation.</p>
    </details>
    <details id="faq2" open>
      <summary>How does it work?</summary>
      <p>It takes accessibility snapshots and executes actions via @ref.</p>
    </details>
    <details id="faq3">
      <summary>Is it open source?</summary>
      <p>Yes, it is.</p>
    </details>
  </body></html>`,

  '/multi-select': `<!DOCTYPE html><html><head><title>Multi Select</title></head><body>
    <h1>Choose Skills</h1>
    <label for="skills">Skills</label>
    <select id="skills" multiple size="5" aria-label="Skills">
      <option value="js">JavaScript</option>
      <option value="ts">TypeScript</option>
      <option value="py">Python</option>
      <option value="go">Go</option>
      <option value="rust">Rust</option>
    </select>
    <div id="selected-display"></div>
    <script>
      document.getElementById('skills').addEventListener('change', function() {
        var selected = Array.from(this.selectedOptions).map(function(o) { return o.text; });
        document.getElementById('selected-display').textContent = 'Selected: ' + selected.join(', ');
      });
    </script>
  </body></html>`,

  '/readonly-inputs': `<!DOCTYPE html><html><head><title>Readonly Inputs</title></head><body>
    <h1>Profile</h1>
    <form>
      <label for="user-id">User ID</label>
      <input id="user-id" type="text" value="USR-12345" readonly aria-label="User ID">
      <label for="username">Username</label>
      <input id="username" type="text" value="" aria-label="Username">
      <label for="bio">Bio</label>
      <textarea id="bio" readonly aria-label="Bio">This is a read-only bio.</textarea>
    </form>
  </body></html>`,

  '/fieldset-legend': `<!DOCTYPE html><html><head><title>Fieldset Legend</title></head><body>
    <h1>Payment</h1>
    <form>
      <fieldset>
        <legend>Billing Address</legend>
        <label for="street">Street</label>
        <input id="street" type="text" aria-label="Street">
        <label for="city">City</label>
        <input id="city" type="text" aria-label="City">
      </fieldset>
      <fieldset>
        <legend>Payment Method</legend>
        <label><input type="radio" name="method" value="card"> Credit Card</label>
        <label><input type="radio" name="method" value="paypal"> PayPal</label>
      </fieldset>
    </form>
  </body></html>`,

  '/label-strategies': `<!DOCTYPE html><html><head><title>Label Strategies</title></head><body>
    <h1>Form Labels</h1>
    <!-- aria-label takes priority -->
    <input id="inp-aria" type="text" aria-label="ARIA Label" placeholder="Placeholder text">
    <!-- aria-labelledby takes priority over aria-label -->
    <span id="ext-label">External Label</span>
    <input id="inp-labelledby" type="text" aria-labelledby="ext-label" aria-label="Fallback Label">
    <!-- Label[for] association -->
    <label for="inp-for">Label For</label>
    <input id="inp-for" type="text">
    <!-- Wrapping label -->
    <label>Wrapping Label <input id="inp-wrap" type="text"></label>
    <!-- Placeholder fallback -->
    <input id="inp-placeholder" type="text" placeholder="Placeholder Only">
    <!-- Title fallback -->
    <input id="inp-title" type="text" title="Title Fallback">
    <!-- Broken aria-labelledby (non-existent ID) -->
    <input id="inp-broken" type="text" aria-labelledby="nonexistent-id" placeholder="Broken Labelledby">
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

describe('ARIA States & Custom Widgets E2E', () => {
  // --- Toggle Buttons (aria-pressed) ---

  it('should show aria-pressed state in snapshot for toggle buttons', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/toggle-buttons`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Bold: pressed=false → (unpressed)
    const boldLine = snap.text.split('\n').find(
      (l: string) => l.includes('button') && l.includes('"Bold"'),
    );
    expect(boldLine).toContain('(unpressed)');

    // Underline: pressed=true → (pressed)
    const underlineLine = snap.text.split('\n').find(
      (l: string) => l.includes('button') && l.includes('"Underline"'),
    );
    expect(underlineLine).toContain('(pressed)');
  }, 30_000);

  it('should update aria-pressed after clicking toggle button', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/toggle-buttons`);
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Click Bold to toggle pressed
    const boldRef = snap.text.match(/@e\d+(?= button "Bold")/)?.[0];
    expect(boldRef).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref: boldRef });

    // Re-snapshot: Bold should now be (pressed)
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const boldLine = snap.text.split('\n').find(
      (l: string) => l.includes('button') && l.includes('"Bold"'),
    );
    expect(boldLine).toContain('(pressed)');

    // Click again to un-press
    const boldRef2 = snap.text.match(/@e\d+(?= button "Bold")/)?.[0];
    await sendToContentScript(browser, page, { action: 'click', ref: boldRef2 });

    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const boldLine2 = snap.text.split('\n').find(
      (l: string) => l.includes('button') && l.includes('"Bold"'),
    );
    expect(boldLine2).toContain('(unpressed)');
  }, 30_000);

  // --- Custom Checkboxes (aria-checked) ---

  it('should show aria-checked state for custom checkboxes', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/custom-checkboxes`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Notifications: aria-checked=false → (unchecked)
    const notifLine = snap.text.split('\n').find(
      (l: string) => l.includes('checkbox') && l.includes('"Enable notifications"'),
    );
    expect(notifLine).toContain('(unchecked)');

    // Dark mode: aria-checked=true → (checked)
    const darkLine = snap.text.split('\n').find(
      (l: string) => l.includes('checkbox') && l.includes('"Dark mode"'),
    );
    expect(darkLine).toContain('(checked)');
  }, 30_000);

  it('should show aria-checked state for custom switch', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/custom-checkboxes`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Switch: aria-checked=false → (unchecked)
    const switchLine = snap.text.split('\n').find(
      (l: string) => l.includes('switch') && l.includes('"Autoplay videos"'),
    );
    expect(switchLine).toContain('(unchecked)');
  }, 30_000);

  it('should update aria-checked after clicking custom checkbox', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/custom-checkboxes`);
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Click notifications checkbox to check it
    const notifRef = snap.text.match(/@e\d+(?= checkbox "Enable notifications")/)?.[0];
    expect(notifRef).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref: notifRef });

    // Re-snapshot: should now be (checked)
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const notifLine = snap.text.split('\n').find(
      (l: string) => l.includes('checkbox') && l.includes('"Enable notifications"'),
    );
    expect(notifLine).toContain('(checked)');

    // Verify status update
    const status = await page.evaluate(() =>
      document.getElementById('status')!.textContent,
    );
    expect(status).toContain('Enable notifications: on');
  }, 30_000);

  // --- SVG Disabled ---

  it('should show SVG button as disabled in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/svg-disabled`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const pauseLine = snap.text.split('\n').find(
      (l: string) => l.includes('button') && l.includes('"Pause"'),
    );
    expect(pauseLine).toContain('(disabled)');

    // Play should NOT be disabled
    const playLine = snap.text.split('\n').find(
      (l: string) => l.includes('button') && l.includes('"Play"'),
    );
    expect(playLine).not.toContain('(disabled)');
  }, 30_000);

  it('should reject click on SVG element with aria-disabled="true"', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/svg-disabled`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const pauseRef = snap.text.match(/@e\d+(?= button "Pause")/)?.[0];
    expect(pauseRef).toBeTruthy();

    const result = await sendToContentScript(browser, page, {
      action: 'click', ref: pauseRef,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('disabled');

    // Verify no side effect
    const resultText = await page.evaluate(() =>
      document.getElementById('svg-result')!.textContent,
    );
    expect(resultText).toBe('');
  }, 30_000);

  it('should allow click on active SVG button', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/svg-disabled`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const playRef = snap.text.match(/@e\d+(?= button "Play")/)?.[0];
    expect(playRef).toBeTruthy();

    const result = await sendToContentScript(browser, page, {
      action: 'click', ref: playRef,
    });
    expect(result.success).toBe(true);

    const resultText = await page.evaluate(() =>
      document.getElementById('svg-result')!.textContent,
    );
    expect(resultText).toBe('played');
  }, 30_000);

  // --- Details/Summary ---

  it('should show summary elements with button role in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/details-summary`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Summary elements should have button role and @ref
    const summaryLine = snap.text.split('\n').find(
      (l: string) => l.includes('button') && l.includes('"What is hermitclaw?"'),
    );
    expect(summaryLine).toBeTruthy();
    expect(summaryLine).toMatch(/@e\d+/);
  }, 30_000);

  it('should toggle details visibility by clicking summary', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/details-summary`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Click first summary to open details
    const summaryRef = snap.text.match(/@e\d+(?= button "What is hermitclaw\?")/)?.[0];
    expect(summaryRef).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref: summaryRef });

    // Verify details opened
    const isOpen = await page.evaluate(() =>
      document.getElementById('faq1')!.open,
    );
    expect(isOpen).toBe(true);

    // Click again to close
    const snap2 = await sendToContentScript(browser, page, { action: 'snapshot' });
    const summaryRef2 = snap2.text.match(/@e\d+(?= button "What is hermitclaw\?")/)?.[0];
    await sendToContentScript(browser, page, { action: 'click', ref: summaryRef2 });

    const isClosed = await page.evaluate(() =>
      document.getElementById('faq1')!.open,
    );
    expect(isClosed).toBe(false);
  }, 30_000);

  // --- Multi Select ---

  it('should select multiple options in select[multiple]', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/multi-select`);
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const selectRef = snap.text.match(/@e\d+(?= listbox "Skills")/)?.[0];
    expect(selectRef).toBeTruthy();

    // Select JavaScript
    let result = await sendToContentScript(browser, page, {
      action: 'selectOption', ref: selectRef, value: 'JavaScript',
    });
    expect(result.success).toBe(true);

    // Select Python (should add to selection, not replace)
    result = await sendToContentScript(browser, page, {
      action: 'selectOption', ref: selectRef, value: 'Python',
    });
    expect(result.success).toBe(true);

    // Re-snapshot: value should show both
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const selectLine = snap.text.split('\n').find(
      (l: string) => l.includes('listbox') && l.includes('"Skills"'),
    );
    expect(selectLine).toContain('JavaScript');
    expect(selectLine).toContain('Python');
  }, 30_000);

  it('should show multi-select value in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/multi-select`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Initially no selection, role should be listbox
    const selectLine = snap.text.split('\n').find(
      (l: string) => l.includes('listbox') && l.includes('"Skills"'),
    );
    expect(selectLine).toBeTruthy();
  }, 30_000);

  // --- Readonly Inputs ---

  it('should show readonly input value in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/readonly-inputs`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const idLine = snap.text.split('\n').find(
      (l: string) => l.includes('textbox') && l.includes('"User ID"'),
    );
    expect(idLine).toBeTruthy();
    expect(idLine).toContain('USR-12345');
  }, 30_000);

  // --- Fieldset/Legend ---

  it('should show fieldset with legend name in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/fieldset-legend`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Fieldset has role="group" with legend text as name
    expect(snap.text).toContain('group');
    expect(snap.text).toContain('"Billing Address"');
    expect(snap.text).toContain('"Payment Method"');
  }, 30_000);

  it('should interact with inputs inside fieldsets', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/fieldset-legend`);
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Type into street input
    const streetRef = snap.text.match(/@e\d+(?= textbox "Street")/)?.[0];
    expect(streetRef).toBeTruthy();
    const result = await sendToContentScript(browser, page, {
      action: 'typeText', ref: streetRef, text: '123 Main St',
    });
    expect(result.success).toBe(true);

    // Select radio button
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const cardLine = snap.text.split('\n').find(
      (l: string) => l.includes('radio') && l.includes('Credit Card'),
    );
    expect(cardLine).toBeTruthy();

    const cardRef = cardLine?.match(/@e\d+/)?.[0];
    expect(cardRef).toBeTruthy();
    const radioResult = await sendToContentScript(browser, page, {
      action: 'click', ref: cardRef,
    });
    expect(radioResult.success).toBe(true);

    // Verify radio checked state
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const checkedLine = snap.text.split('\n').find(
      (l: string) => l.includes('radio') && l.includes('Credit Card'),
    );
    expect(checkedLine).toContain('(checked)');
  }, 30_000);

  // --- Label Strategy Priority ---

  it('should prioritize aria-label over placeholder', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/label-strategies`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // aria-label should win over placeholder
    expect(snap.text).toContain('"ARIA Label"');
    expect(snap.text).not.toContain('"Placeholder text"');
  }, 30_000);

  it('should prioritize aria-labelledby over aria-label', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/label-strategies`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // aria-labelledby should win over aria-label
    expect(snap.text).toContain('"External Label"');
    // "Fallback Label" should NOT appear as a name
    const fallbackLine = snap.text.split('\n').find(
      (l: string) => l.includes('"Fallback Label"'),
    );
    expect(fallbackLine).toBeFalsy();
  }, 30_000);

  it('should use label[for] for input naming', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/label-strategies`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    expect(snap.text).toContain('"Label For"');
  }, 30_000);

  it('should use wrapping label for input naming', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/label-strategies`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    expect(snap.text).toContain('"Wrapping Label"');
  }, 30_000);

  it('should fall back to placeholder when no label exists', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/label-strategies`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    expect(snap.text).toContain('"Placeholder Only"');
  }, 30_000);

  it('should fall back to title when no other label exists', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/label-strategies`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    expect(snap.text).toContain('"Title Fallback"');
  }, 30_000);

  it('should fall back to placeholder when aria-labelledby is broken', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/label-strategies`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Broken aria-labelledby (nonexistent ID) should fall back to placeholder
    expect(snap.text).toContain('"Broken Labelledby"');
  }, 30_000);
});
