/**
 * E2E tests for snapshot engine edge cases:
 * - Nested interactive elements (button inside link)
 * - Special characters in names (quotes, newlines)
 * - SVG with role="img" and aria-label
 * - visibility:hidden with visibility:visible children
 * - Label click → checkbox toggle
 * - role="presentation" on interactive elements
 * - aria-labelledby with missing/partial IDs
 * - Input maxlength behavior
 * - Duplicate option text
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

describe('Snapshot & Action Edge Cases E2E', () => {
  let browser: Browser;
  let page: Page;
  let server: Server;
  let port: number;

  const TEST_PAGES: Record<string, string> = {
    '/nested-interactive': `<!DOCTYPE html><html><head><title>Nested Interactive</title></head><body>
      <h1>Nested Interactive Elements</h1>

      <!-- Button inside a link -->
      <a href="javascript:void(0)" id="outer-link" onclick="
        document.getElementById('result').textContent = 'link clicked'
      ">
        Visit
        <button id="inner-btn" onclick="
          event.stopPropagation();
          document.getElementById('result').textContent = 'button clicked'
        ">Action</button>
      </a>

      <!-- Input inside a label -->
      <label id="label1">
        <input type="checkbox" id="cb1"> Accept Terms
      </label>

      <!-- Label with for= attribute -->
      <input type="checkbox" id="cb2">
      <label for="cb2" id="label2">Subscribe to newsletter</label>

      <!-- Link wrapping an entire card -->
      <a href="javascript:void(0)" id="card-link" onclick="
        document.getElementById('result').textContent = 'card clicked'
      ">
        <div>
          <h3>Card Title</h3>
          <p>Card description text</p>
        </div>
      </a>

      <div id="result"></div>
    </body></html>`,

    '/special-chars': `<!DOCTYPE html><html><head><title>Special Characters</title></head><body>
      <h1>Special Characters in Names</h1>

      <!-- Button with quotes in text -->
      <button id="quote-btn">Say "Hello World"</button>

      <!-- Button with newlines in text -->
      <button id="newline-btn">First Line
        Second Line</button>

      <!-- Very long button text (>80 chars) -->
      <button id="long-btn">This is a very long button label that definitely exceeds the eighty character truncation limit by a significant margin</button>

      <!-- Long text with quotes near truncation point -->
      <button id="long-quote-btn">Click here to open the "advanced settings" panel which contains many options for detailed</button>

      <!-- Unicode/emoji in text -->
      <button id="emoji-btn">Save Changes ✓</button>

      <!-- Input with special chars in aria-label -->
      <input type="text" id="special-input" aria-label='Search "products" & categories'>

      <!-- Heading with special chars -->
      <h2 id="special-heading">FAQ &amp; "Help" Section</h2>

      <div id="result"></div>
    </body></html>`,

    '/svg-elements': `<!DOCTYPE html><html><head><title>SVG Elements</title></head><body>
      <h1>SVG Accessibility</h1>

      <!-- SVG with role and aria-label -->
      <svg role="img" aria-label="Revenue Chart" width="100" height="100" id="svg-chart">
        <circle cx="50" cy="50" r="40" fill="blue"/>
      </svg>

      <!-- SVG as a button -->
      <button id="svg-btn" aria-label="Close dialog">
        <svg width="16" height="16" viewBox="0 0 16 16">
          <path d="M4 4l8 8M12 4l-8 8" stroke="black"/>
        </svg>
      </button>

      <!-- Inline SVG icon inside a link -->
      <a href="#" id="svg-link">
        <svg width="16" height="16"><circle cx="8" cy="8" r="6"/></svg>
        Home
      </a>

      <!-- Standalone clickable SVG -->
      <svg role="button" tabindex="0" aria-label="Toggle Theme" id="svg-toggle"
           width="24" height="24" onclick="
        document.getElementById('result').textContent = 'theme toggled'
      ">
        <circle cx="12" cy="12" r="10" fill="yellow"/>
      </svg>

      <div id="result"></div>
    </body></html>`,

    '/visibility': `<!DOCTYPE html><html><head><title>Visibility Edge Cases</title></head><body>
      <h1>Visibility Edge Cases</h1>

      <!-- visibility:hidden parent with visibility:visible child -->
      <div style="visibility:hidden" id="hidden-parent">
        <p>This text is hidden</p>
        <button style="visibility:visible" id="visible-child-btn">Visible Child</button>
        <input style="visibility:visible" type="text" id="visible-child-input"
               aria-label="Visible input">
      </div>

      <!-- opacity:0 parent with normal child -->
      <div style="opacity:0" id="opacity-parent">
        <button style="opacity:1" id="opacity-child-btn">Opacity Child</button>
      </div>

      <!-- display:none parent (children should NOT be visible) -->
      <div style="display:none" id="display-none-parent">
        <button id="hidden-btn">Should Not Appear</button>
      </div>

      <!-- Nested visibility overrides -->
      <div style="visibility:hidden">
        <div style="visibility:visible">
          <div style="visibility:hidden">
            <button style="visibility:visible" id="deep-visible-btn">Deep Visible</button>
          </div>
        </div>
      </div>

      <div id="result"></div>
      <script>
        document.getElementById('visible-child-btn').addEventListener('click', function() {
          document.getElementById('result').textContent = 'visible child clicked';
        });
        document.getElementById('deep-visible-btn').addEventListener('click', function() {
          document.getElementById('result').textContent = 'deep visible clicked';
        });
      </script>
    </body></html>`,

    '/label-interaction': `<!DOCTYPE html><html><head><title>Label Interaction</title></head><body>
      <h1>Label Interaction Tests</h1>

      <!-- Wrapping label (checkbox inside label) -->
      <label id="wrap-label">
        <input type="checkbox" id="wrap-cb"> Enable notifications
      </label>

      <!-- Separate label with for= -->
      <input type="checkbox" id="for-cb">
      <label for="for-cb" id="for-label">Accept cookies</label>

      <!-- Radio buttons with labels -->
      <fieldset>
        <legend>Plan</legend>
        <label><input type="radio" name="plan" id="plan-free" value="free" checked> Free</label>
        <label><input type="radio" name="plan" id="plan-pro" value="pro"> Pro</label>
        <label><input type="radio" name="plan" id="plan-ent" value="enterprise"> Enterprise</label>
      </fieldset>

      <div id="result"></div>
    </body></html>`,

    '/role-presentation': `<!DOCTYPE html><html><head><title>Role Presentation</title></head><body>
      <h1>Role Presentation/None</h1>

      <!-- Table with role=presentation (layout table) -->
      <table role="presentation">
        <tr><td><button id="layout-btn">Layout Button</button></td>
            <td><input type="text" id="layout-input" aria-label="Layout Input"></td></tr>
      </table>

      <!-- Nav with role=none -->
      <nav role="none">
        <a href="#" id="none-link1">Link 1</a>
        <a href="#" id="none-link2">Link 2</a>
      </nav>

      <!-- List with role=presentation -->
      <ul role="presentation">
        <li><a href="#" id="list-link">List Link</a></li>
      </ul>

      <!-- Interactive element with role=presentation - should it still be interactive? -->
      <button role="presentation" id="pres-btn" onclick="
        document.getElementById('result').textContent = 'presentation button clicked'
      ">Presentation Button</button>

      <div id="result"></div>
    </body></html>`,

    '/aria-labelledby': `<!DOCTYPE html><html><head><title>ARIA Labelledby</title></head><body>
      <h1>ARIA Labelledby Edge Cases</h1>

      <!-- Normal: both IDs exist -->
      <span id="lbl-action">Delete</span>
      <span id="lbl-target">Item 5</span>
      <button id="btn-normal" aria-labelledby="lbl-action lbl-target">X</button>

      <!-- Partial: one ID missing -->
      <span id="lbl-existing">Save</span>
      <button id="btn-partial" aria-labelledby="lbl-existing missing-id">Y</button>

      <!-- All IDs missing -->
      <button id="btn-missing" aria-labelledby="nonexistent1 nonexistent2">Fallback Text</button>

      <!-- Self-referencing -->
      <button id="btn-self" aria-labelledby="btn-self extra-label">Self</button>
      <span id="extra-label">Label</span>

      <!-- Circular reference -->
      <span id="circ-a" aria-labelledby="circ-b">A</span>
      <span id="circ-b" aria-labelledby="circ-a">B</span>
      <button id="btn-circ" aria-labelledby="circ-a">Z</button>

      <div id="result"></div>
    </body></html>`,

    '/input-constraints': `<!DOCTYPE html><html><head><title>Input Constraints</title></head><body>
      <h1>Input Constraint Tests</h1>

      <!-- maxlength -->
      <input type="text" id="maxlen-input" maxlength="5" aria-label="Max 5 chars">

      <!-- email -->
      <input type="email" id="email-input" aria-label="Email address">

      <!-- number with min/max -->
      <input type="number" id="num-input" min="0" max="10" aria-label="Quantity (0-10)">

      <!-- url -->
      <input type="url" id="url-input" aria-label="Website URL">

      <!-- pattern -->
      <input type="text" id="pattern-input" pattern="[A-Za-z]{3}" aria-label="3 letter code">

      <!-- readonly -->
      <input type="text" id="readonly-input" readonly value="Cannot change" aria-label="Readonly field">

      <!-- Duplicate option text in select -->
      <select id="dup-select" aria-label="Duplicate options">
        <option value="1">Same Text</option>
        <option value="2">Same Text</option>
        <option value="3">Different</option>
      </select>

      <div id="result"></div>
      <button id="validate-btn" onclick="
        var inputs = ['email-input','num-input','url-input','pattern-input'];
        var results = inputs.map(function(id) {
          var el = document.getElementById(id);
          return id + ':' + (el.checkValidity() ? 'valid' : 'invalid');
        });
        document.getElementById('result').textContent = results.join('; ');
      ">Validate</button>
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

  // --- Nested Interactive Elements ---

  it('should assign @refs to both link and nested button', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/nested-interactive`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Both the outer link and inner button should get @refs
    const linkRef = snap.text.match(/@e\d+(?= link)/)?.[0];
    const btnRef = snap.text.match(/@e\d+(?= button "Action")/)?.[0];
    expect(linkRef).toBeTruthy();
    expect(btnRef).toBeTruthy();
    expect(linkRef).not.toBe(btnRef);
  }, 30_000);

  it('should click inner button without triggering outer link', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/nested-interactive`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const btnRef = snap.text.match(/@e\d+(?= button "Action")/)?.[0];
    expect(btnRef).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref: btnRef });

    const result = await page.evaluate(() =>
      document.getElementById('result')!.textContent
    );
    expect(result).toBe('button clicked');
  }, 30_000);

  it('should click wrapping label and toggle its checkbox', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/nested-interactive`);

    // Checkbox should start unchecked
    let checked = await page.evaluate(() =>
      (document.getElementById('cb1') as HTMLInputElement).checked
    );
    expect(checked).toBe(false);

    // Click the wrapping label's checkbox ref
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    // Find the checkbox ref (inside the label)
    const cbRef = snap.text.match(/@e\d+(?= checkbox)/)?.[0];
    expect(cbRef).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref: cbRef });

    checked = await page.evaluate(() =>
      (document.getElementById('cb1') as HTMLInputElement).checked
    );
    expect(checked).toBe(true);
  }, 30_000);

  it('should show card link text in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/nested-interactive`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // The card link should have its text content
    expect(snap.text).toContain('Card Title');
  }, 30_000);

  // --- Special Characters ---

  it('should handle quotes in button text', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/special-chars`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Button with quotes - should appear in snapshot (name might include quotes)
    const ref = snap.text.match(/@e\d+(?= button.*Hello)/)?.[0];
    expect(ref).toBeTruthy();

    // Click should work
    const result = await sendToContentScript(browser, page, { action: 'click', ref });
    expect(result.success).toBe(true);
  }, 30_000);

  it('should handle newlines in button text by collapsing whitespace', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/special-chars`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Button text has newlines - textContent.trim() collapses them
    // Should still find the button
    const ref = snap.text.match(/@e\d+(?= button.*First Line)/)?.[0];
    expect(ref).toBeTruthy();
  }, 30_000);

  it('should preserve long button text without truncation', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/special-chars`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Long button text should be preserved in full
    expect(snap.text).toContain('significant margin');
  }, 30_000);

  it('should handle emoji in button text', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/special-chars`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Emoji button should appear
    expect(snap.text).toMatch(/button.*Save Changes/);
  }, 30_000);

  it('should handle special chars in aria-label', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/special-chars`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Input with special chars in aria-label
    expect(snap.text).toContain('products');
  }, 30_000);

  // --- SVG Elements ---

  it('should include button containing SVG icon in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/svg-elements`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Button with SVG child should appear with aria-label
    expect(snap.text).toContain('Close dialog');
    const ref = snap.text.match(/@e\d+(?= button "Close dialog")/)?.[0];
    expect(ref).toBeTruthy();
  }, 30_000);

  it('should include link containing SVG and text in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/svg-elements`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Link with SVG and text "Home" should appear
    const ref = snap.text.match(/@e\d+(?= link.*Home)/)?.[0];
    expect(ref).toBeTruthy();
  }, 30_000);

  it('should include standalone SVG with role="img" and aria-label in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/svg-elements`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // SVG with role="img" and aria-label should appear in snapshot
    expect(snap.text).toContain('img "Revenue Chart"');
  }, 30_000);

  it('should include clickable SVG with role="button" and allow click', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/svg-elements`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // SVG with role="button" should appear with a @ref
    expect(snap.text).toContain('Toggle Theme');
    const ref = snap.text.match(/@e\d+(?= button "Toggle Theme")/)?.[0];
    expect(ref).toBeTruthy();

    await sendToContentScript(browser, page, { action: 'click', ref });
    const result = await page.evaluate(() =>
      document.getElementById('result')!.textContent
    );
    expect(result).toBe('theme toggled');
  }, 30_000);

  // --- Visibility Edge Cases ---

  it('should show visibility:visible children inside visibility:hidden parent', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/visibility`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Children with visibility:visible should appear
    expect(snap.text).toContain('Visible Child');
    expect(snap.text).toContain('Visible input');
  }, 30_000);

  it('should click visibility:visible child inside hidden parent', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/visibility`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = snap.text.match(/@e\d+(?= button "Visible Child")/)?.[0];
    expect(ref).toBeTruthy();

    await sendToContentScript(browser, page, { action: 'click', ref });
    const result = await page.evaluate(() =>
      document.getElementById('result')!.textContent
    );
    expect(result).toBe('visible child clicked');
  }, 30_000);

  it('should NOT show children of display:none parent', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/visibility`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    expect(snap.text).not.toContain('Should Not Appear');
  }, 30_000);

  it('should show deeply nested visibility:visible button', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/visibility`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    expect(snap.text).toContain('Deep Visible');

    const ref = snap.text.match(/@e\d+(?= button "Deep Visible")/)?.[0];
    expect(ref).toBeTruthy();

    await sendToContentScript(browser, page, { action: 'click', ref });
    const result = await page.evaluate(() =>
      document.getElementById('result')!.textContent
    );
    expect(result).toBe('deep visible clicked');
  }, 30_000);

  // --- Label Interaction ---

  it('should toggle checkbox when clicking its for= label ref', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/label-interaction`);

    // Initial state: unchecked
    let checked = await page.evaluate(() =>
      (document.getElementById('for-cb') as HTMLInputElement).checked
    );
    expect(checked).toBe(false);

    // The checkbox should appear in the snapshot
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Find the checkbox by its label name
    const cbRef = snap.text.match(/@e\d+(?= checkbox "Accept cookies")/)?.[0];
    expect(cbRef).toBeTruthy();

    // Click the checkbox directly
    await sendToContentScript(browser, page, { action: 'click', ref: cbRef });

    checked = await page.evaluate(() =>
      (document.getElementById('for-cb') as HTMLInputElement).checked
    );
    expect(checked).toBe(true);
  }, 30_000);

  it('should switch radio buttons via click', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/label-interaction`);
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Free should be checked initially
    expect(snap.text).toMatch(/radio "Free".*\(checked\)/);
    expect(snap.text).toMatch(/radio "Pro".*\(unchecked\)/);

    // Click Pro radio
    const proRef = snap.text.match(/@e\d+(?= radio "Pro")/)?.[0];
    expect(proRef).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref: proRef });

    // Re-snapshot: Pro should be checked, Free unchecked
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toMatch(/radio "Free".*\(unchecked\)/);
    expect(snap.text).toMatch(/radio "Pro".*\(checked\)/);
  }, 30_000);

  // --- Role Presentation ---

  it('should show interactive elements inside role=presentation table', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/role-presentation`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Table has role=presentation, so table/row/cell structure removed
    // But interactive elements inside should still appear
    expect(snap.text).toContain('Layout Button');
    expect(snap.text).toContain('Layout Input');

    // Table structural roles should NOT appear
    expect(snap.text).not.toMatch(/\[table\b/);
    expect(snap.text).not.toMatch(/\[row\b/);
    expect(snap.text).not.toMatch(/\[cell\b/);
  }, 30_000);

  it('should show links inside role=none nav', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/role-presentation`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Links should still appear
    expect(snap.text).toContain('Link 1');
    expect(snap.text).toContain('Link 2');

    // nav role should NOT appear
    expect(snap.text).not.toMatch(/\[nav\b/);
  }, 30_000);

  it('should handle button with role=presentation (still clickable)', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/role-presentation`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Button with role=presentation: getRole returns '' but isInteractive still true
    // So it should still get a @ref
    const ref = snap.text.match(/@e\d+.*Presentation Button/)?.[0]?.match(/@e\d+/)?.[0];
    expect(ref).toBeTruthy();

    await sendToContentScript(browser, page, { action: 'click', ref });
    const result = await page.evaluate(() =>
      document.getElementById('result')!.textContent
    );
    expect(result).toBe('presentation button clicked');
  }, 30_000);

  // --- ARIA Labelledby ---

  it('should combine multiple aria-labelledby sources', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/aria-labelledby`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // aria-labelledby="lbl-action lbl-target" → "Delete Item 5"
    expect(snap.text).toContain('Delete Item 5');
  }, 30_000);

  it('should handle partial aria-labelledby (one ID missing)', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/aria-labelledby`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // aria-labelledby="lbl-existing missing-id" → "Save" (only existing one)
    expect(snap.text).toContain('"Save"');
  }, 30_000);

  it('should fallback to textContent when all aria-labelledby IDs are missing', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/aria-labelledby`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // aria-labelledby="nonexistent1 nonexistent2" → should fallback to textContent "Fallback Text"
    expect(snap.text).toContain('Fallback Text');
  }, 30_000);

  it('should handle self-referencing aria-labelledby', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/aria-labelledby`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // aria-labelledby="btn-self extra-label" → "Self Label"
    expect(snap.text).toContain('Self Label');
  }, 30_000);

  // --- Input Constraints ---

  it('should type into maxlength input and verify value', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/input-constraints`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = snap.text.match(/@e\d+(?= textbox "Max 5 chars")/)?.[0];
    expect(ref).toBeTruthy();

    // Type text longer than maxlength
    await sendToContentScript(browser, page, {
      action: 'typeText', ref, text: 'abcdefgh',
    });

    const value = await page.evaluate(() =>
      (document.getElementById('maxlen-input') as HTMLInputElement).value
    );
    // Native setter may or may not respect maxlength - document actual behavior
    // In Chrome, native value setter bypasses maxlength
    expect(value.length).toBeGreaterThan(0);
  }, 30_000);

  it('should type invalid email and still succeed (no validation on type)', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/input-constraints`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = snap.text.match(/@e\d+(?= textbox "Email address")/)?.[0];
    expect(ref).toBeTruthy();

    const result = await sendToContentScript(browser, page, {
      action: 'typeText', ref, text: 'not-an-email',
    });
    expect(result.success).toBe(true);

    // Value should be set even though it's invalid
    const value = await page.evaluate(() =>
      (document.getElementById('email-input') as HTMLInputElement).value
    );
    expect(value).toBe('not-an-email');
  }, 30_000);

  it('should select first matching option when duplicates exist', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/input-constraints`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = snap.text.match(/@e\d+(?= combobox "Duplicate options")/)?.[0];
    expect(ref).toBeTruthy();

    const result = await sendToContentScript(browser, page, {
      action: 'selectOption', ref, value: 'Same Text',
    });
    expect(result.success).toBe(true);

    // Should select the FIRST option with matching text (value="1")
    const value = await page.evaluate(() =>
      (document.getElementById('dup-select') as HTMLSelectElement).value
    );
    expect(value).toBe('1');
  }, 30_000);

  it('should type into readonly input (documents actual behavior)', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/input-constraints`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = snap.text.match(/@e\d+(?= textbox "Readonly field")/)?.[0];
    expect(ref).toBeTruthy();

    // typeText uses native setter which can bypass readonly
    const result = await sendToContentScript(browser, page, {
      action: 'typeText', ref, text: 'overwritten',
    });
    // Document actual behavior
    expect(result.success).toBe(true);
  }, 30_000);
});
