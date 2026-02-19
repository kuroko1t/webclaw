/**
 * E2E: Real-world user scenarios
 *
 * Tests that simulate actual user workflows with complex, real-world web pages.
 * Each test represents a common scenario a browser automation agent would encounter.
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

/* ---------- Test HTML pages ---------- */

/** Login form with validation, password field, and error messages */
const LOGIN_PAGE = `<!DOCTYPE html><html><body>
  <h1>Login</h1>
  <form id="login-form">
    <label for="email">Email</label>
    <input id="email" type="email" name="email" required aria-label="Email address">
    <label for="password">Password</label>
    <input id="password" type="password" name="password" required aria-label="Password">
    <label><input id="remember" type="checkbox" name="remember"> Remember me</label>
    <button id="login-btn" type="submit">Log in</button>
  </form>
  <div id="error-msg" style="display:none;color:red" role="alert">Invalid credentials</div>
  <a href="/signup" id="signup-link">Sign up</a>
  <script>
    document.getElementById('login-form').addEventListener('submit', e => {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const pass = document.getElementById('password').value;
      if (email === 'test@example.com' && pass === 'password123') {
        document.body.innerHTML = '<h1>Dashboard</h1><p id="welcome">Welcome, test@example.com!</p><button id="logout-btn">Log out</button>';
      } else {
        document.getElementById('error-msg').style.display = 'block';
      }
    });
  </script>
</body></html>`;

/** Various input types that agents commonly encounter */
const FORM_TYPES_PAGE = `<!DOCTYPE html><html><body>
  <h1>All Input Types</h1>
  <form>
    <input id="text1" type="text" aria-label="Text input" value="">
    <input id="num1" type="number" aria-label="Number input" min="0" max="100">
    <input id="search1" type="search" aria-label="Search field">
    <input id="url1" type="url" aria-label="URL field">
    <input id="tel1" type="tel" aria-label="Phone number">
    <input id="date1" type="date" aria-label="Date picker">
    <input id="range1" type="range" min="0" max="100" value="50" aria-label="Volume slider">
    <textarea id="ta1" aria-label="Message box" rows="4">Hello</textarea>
    <select id="multi1" multiple aria-label="Multi select" size="3">
      <option value="a">Alpha</option>
      <option value="b">Beta</option>
      <option value="c">Gamma</option>
    </select>
    <select id="sel-group" aria-label="Grouped select">
      <optgroup label="Fruits">
        <option value="apple">Apple</option>
        <option value="banana">Banana</option>
      </optgroup>
      <optgroup label="Vegs">
        <option value="carrot">Carrot</option>
      </optgroup>
    </select>
  </form>
</body></html>`;

/** Dynamic AJAX-like content loading */
const DYNAMIC_PAGE = `<!DOCTYPE html><html><body>
  <h1>Dynamic Content</h1>
  <button id="load-btn" aria-label="Load more">Load more</button>
  <div id="content"></div>
  <script>
    let count = 0;
    document.getElementById('load-btn').addEventListener('click', () => {
      count++;
      const div = document.createElement('div');
      div.id = 'item-' + count;
      div.innerHTML = '<button id="btn-' + count + '">Item ' + count + '</button><input type="text" aria-label="Input ' + count + '">';
      document.getElementById('content').appendChild(div);
    });
  </script>
</body></html>`;

/** Modal / Dialog interactions */
const MODAL_PAGE = `<!DOCTYPE html><html><body>
  <h1>Modal Test</h1>
  <button id="open-modal">Open Modal</button>
  <dialog id="modal1">
    <h2>Confirm Action</h2>
    <p>Are you sure?</p>
    <input id="modal-input" type="text" aria-label="Reason">
    <button id="modal-confirm">Confirm</button>
    <button id="modal-cancel">Cancel</button>
  </dialog>
  <div id="result"></div>
  <script>
    document.getElementById('open-modal').addEventListener('click', () => {
      document.getElementById('modal1').showModal();
    });
    document.getElementById('modal-confirm').addEventListener('click', () => {
      const reason = document.getElementById('modal-input').value;
      document.getElementById('result').textContent = 'Confirmed: ' + reason;
      document.getElementById('modal1').close();
    });
    document.getElementById('modal-cancel').addEventListener('click', () => {
      document.getElementById('modal1').close();
    });
  </script>
</body></html>`;

/** Tabs / Accordion pattern with show/hide */
const TABS_PAGE = `<!DOCTYPE html><html><body>
  <h1>Tab Interface</h1>
  <div role="tablist">
    <button role="tab" id="tab1" aria-selected="true" aria-controls="panel1" onclick="switchTab('panel1',this)">Tab 1</button>
    <button role="tab" id="tab2" aria-selected="false" aria-controls="panel2" onclick="switchTab('panel2',this)">Tab 2</button>
    <button role="tab" id="tab3" aria-selected="false" aria-controls="panel3" onclick="switchTab('panel3',this)">Tab 3</button>
  </div>
  <div id="panel1" role="tabpanel">
    <p>Content for tab 1</p>
    <input type="text" aria-label="Tab1 input">
  </div>
  <div id="panel2" role="tabpanel" style="display:none">
    <p>Content for tab 2</p>
    <button id="tab2-action">Tab 2 Action</button>
  </div>
  <div id="panel3" role="tabpanel" style="display:none">
    <p>Content for tab 3</p>
    <textarea aria-label="Tab3 notes">notes here</textarea>
  </div>
  <script>
    function switchTab(panelId, tabEl) {
      document.querySelectorAll('[role="tabpanel"]').forEach(p => p.style.display = 'none');
      document.querySelectorAll('[role="tab"]').forEach(t => t.setAttribute('aria-selected', 'false'));
      document.getElementById(panelId).style.display = 'block';
      tabEl.setAttribute('aria-selected', 'true');
    }
  </script>
</body></html>`;

/** Special characters, Unicode, multi-line text */
const SPECIAL_CHARS_PAGE = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
  <h1>Special Characters</h1>
  <input id="unicode-input" type="text" aria-label="Unicode input">
  <textarea id="multiline-ta" aria-label="Multi-line text"></textarea>
  <input id="html-input" type="text" aria-label="HTML entities">
  <div id="output"></div>
</body></html>`;

/** Table with interactive cells */
const TABLE_PAGE = `<!DOCTYPE html><html><body>
  <h1>Data Table</h1>
  <table>
    <thead><tr><th>Name</th><th>Action</th></tr></thead>
    <tbody>
      <tr><td>Row 1</td><td><button id="edit-1" aria-label="Edit Row 1">Edit</button><button id="del-1" aria-label="Delete Row 1">Delete</button></td></tr>
      <tr><td>Row 2</td><td><button id="edit-2" aria-label="Edit Row 2">Edit</button><button id="del-2" aria-label="Delete Row 2">Delete</button></td></tr>
      <tr><td>Row 3</td><td><button id="edit-3" aria-label="Edit Row 3">Edit</button><button id="del-3" aria-label="Delete Row 3">Delete</button></td></tr>
    </tbody>
  </table>
  <div id="table-output"></div>
  <script>
    document.querySelectorAll('button[id^="edit-"]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('table-output').textContent = 'Editing ' + btn.id.replace('edit-','row ');
      });
    });
    document.querySelectorAll('button[id^="del-"]').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.closest('tr').remove();
      });
    });
  </script>
</body></html>`;

/** Link navigation and anchor links */
const NAV_PAGE = `<!DOCTYPE html><html><body>
  <h1 id="top">Navigation Test</h1>
  <nav>
    <a href="#section1">Go to Section 1</a>
    <a href="#section2">Go to Section 2</a>
    <a href="/other" id="other-link">Other Page</a>
  </nav>
  <div style="height:500px"></div>
  <h2 id="section1">Section 1</h2>
  <p>Content of section 1</p>
  <div style="height:500px"></div>
  <h2 id="section2">Section 2</h2>
  <p>Content of section 2</p>
  <a href="#top">Back to top</a>
</body></html>`;

const OTHER_PAGE = `<!DOCTYPE html><html><body>
  <h1>Other Page</h1>
  <p>You navigated here!</p>
  <a href="/">Go back</a>
</body></html>`;

/** Disabled and readonly form states */
const FORM_STATES_PAGE = `<!DOCTYPE html><html><body>
  <h1>Form States</h1>
  <fieldset id="fs1" disabled>
    <legend>Disabled Fieldset</legend>
    <input id="fs-input" type="text" aria-label="Disabled fieldset input">
    <button id="fs-btn">Fieldset Button</button>
  </fieldset>
  <button id="enable-btn" onclick="document.getElementById('fs1').disabled=false">Enable Fieldset</button>
  <input id="disabled-input" type="text" disabled aria-label="Disabled input" value="locked">
  <select id="disabled-select" disabled aria-label="Disabled select">
    <option value="x">X</option>
  </select>
</body></html>`;

describe('Real-World Scenarios E2E', () => {
  let browser: Browser;
  let server: Server;
  let port: number;
  let page: Page;

  beforeAll(async () => {
    ({ server, port } = await startTestServer({
      '/': LOGIN_PAGE,
      '/form-types': FORM_TYPES_PAGE,
      '/dynamic': DYNAMIC_PAGE,
      '/modal': MODAL_PAGE,
      '/tabs': TABS_PAGE,
      '/special': SPECIAL_CHARS_PAGE,
      '/table': TABLE_PAGE,
      '/nav': NAV_PAGE,
      '/other': OTHER_PAGE,
      '/form-states': FORM_STATES_PAGE,
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

  // ---- Login flow ----

  it('should complete a full login flow: type email, password, click submit', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Type email
    const emailRef = extractRef(snap.text, 'Email address');
    expect(emailRef).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'typeText', ref: emailRef, text: 'test@example.com' });

    // Type password
    const passRef = extractRef(snap.text, 'Password');
    expect(passRef).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'typeText', ref: passRef, text: 'password123' });

    // Click login
    const loginRef = extractRef(snap.text, 'Log in');
    expect(loginRef).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref: loginRef });

    // Wait for DOM update
    await new Promise(r => setTimeout(r, 500));

    // Verify we're on the dashboard
    const newSnap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(newSnap.text).toContain('Dashboard');
  }, 20_000);

  it('should show error on wrong credentials and allow retry', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const emailRef = extractRef(snap.text, 'Email address');
    const passRef = extractRef(snap.text, 'Password');
    const loginRef = extractRef(snap.text, 'Log in');

    // Enter wrong credentials
    await sendToContentScript(browser, page, { action: 'typeText', ref: emailRef, text: 'wrong@example.com' });
    await sendToContentScript(browser, page, { action: 'typeText', ref: passRef, text: 'wrong' });
    await sendToContentScript(browser, page, { action: 'click', ref: loginRef });

    await new Promise(r => setTimeout(r, 300));

    // Error should now be visible in snapshot
    const snap2 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap2.text).toContain('Invalid credentials');
  }, 20_000);

  it('should toggle a checkbox (Remember me)', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const cbRef = extractRef(snap.text, 'Remember me');
    expect(cbRef).toBeTruthy();

    // Should be unchecked initially
    expect(snap.text).toMatch(/Remember me.*unchecked/s);

    // Click to check
    await sendToContentScript(browser, page, { action: 'click', ref: cbRef });
    const snap2 = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Find the checkbox line after click
    const checked = await page.evaluate(() => (document.getElementById('remember') as HTMLInputElement).checked);
    expect(checked).toBe(true);
  }, 15_000);

  // ---- Various input types ----

  it('should type into a textarea and preserve existing text with clearFirst=false', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/form-types`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const taRef = extractRef(snap.text, 'Message box');
    expect(taRef).toBeTruthy();

    // Append to existing text
    const result = await sendToContentScript(browser, page, {
      action: 'typeText', ref: taRef, text: ' World', clearFirst: false,
    });
    expect(result.success).toBe(true);

    const val = await page.evaluate(() => (document.getElementById('ta1') as HTMLTextAreaElement).value);
    expect(val).toBe('Hello World');
  }, 15_000);

  it('should type into number, search, url, tel, date inputs', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/form-types`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const tests: Array<{ label: string; text: string; id: string }> = [
      { label: 'Number input', text: '42', id: 'num1' },
      { label: 'Search field', text: 'hello search', id: 'search1' },
      { label: 'URL field', text: 'https://example.com', id: 'url1' },
      { label: 'Phone number', text: '+1-555-0100', id: 'tel1' },
    ];

    for (const t of tests) {
      const ref = extractRef(snap.text, t.label);
      expect(ref).toBeTruthy();
      const result = await sendToContentScript(browser, page, {
        action: 'typeText', ref, text: t.text,
      });
      expect(result.success).toBe(true);
      const val = await page.evaluate((id: string) => (document.getElementById(id) as HTMLInputElement).value, t.id);
      expect(val).toBe(t.text);
    }
  }, 20_000);

  it('should select from a grouped select (optgroup)', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/form-types`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const selRef = extractRef(snap.text, 'Grouped select');
    expect(selRef).toBeTruthy();

    const result = await sendToContentScript(browser, page, {
      action: 'selectOption', ref: selRef, value: 'Banana',
    });
    expect(result.success).toBe(true);

    const val = await page.evaluate(() => (document.getElementById('sel-group') as HTMLSelectElement).value);
    expect(val).toBe('banana');
  }, 15_000);

  // ---- Dynamic content ----

  it('should interact with dynamically added elements after re-snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/dynamic`);

    // Take initial snapshot and click Load more
    const snap1 = await sendToContentScript(browser, page, { action: 'snapshot' });
    const loadRef = extractRef(snap1.text, 'Load more');
    expect(loadRef).toBeTruthy();

    await sendToContentScript(browser, page, { action: 'click', ref: loadRef });
    await new Promise(r => setTimeout(r, 300));

    // Take new snapshot to see the new elements
    const snap2 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap2.text).toContain('Item 1');

    // Click the dynamically created button
    const itemRef = extractRef(snap2.text, 'Item 1');
    expect(itemRef).toBeTruthy();
    const clickResult = await sendToContentScript(browser, page, { action: 'click', ref: itemRef });
    expect(clickResult.success).toBe(true);

    // Type into dynamically created input
    const inputRef = extractRef(snap2.text, 'Input 1');
    expect(inputRef).toBeTruthy();
    const typeResult = await sendToContentScript(browser, page, {
      action: 'typeText', ref: inputRef, text: 'dynamic text',
    });
    expect(typeResult.success).toBe(true);
  }, 20_000);

  it('should handle multiple Load more clicks with re-snapshots', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/dynamic`);

    for (let i = 1; i <= 3; i++) {
      const snap = await sendToContentScript(browser, page, { action: 'snapshot' });
      const loadRef = extractRef(snap.text, 'Load more');
      await sendToContentScript(browser, page, { action: 'click', ref: loadRef });
      await new Promise(r => setTimeout(r, 200));
    }

    const finalSnap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(finalSnap.text).toContain('Item 1');
    expect(finalSnap.text).toContain('Item 2');
    expect(finalSnap.text).toContain('Item 3');
  }, 20_000);

  // ---- Modal / Dialog ----

  it('should open modal, fill input, and confirm', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/modal`);

    const snap1 = await sendToContentScript(browser, page, { action: 'snapshot' });
    const openRef = extractRef(snap1.text, 'Open Modal');
    expect(openRef).toBeTruthy();

    await sendToContentScript(browser, page, { action: 'click', ref: openRef });
    await new Promise(r => setTimeout(r, 300));

    // Re-snapshot to see the dialog content
    const snap2 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap2.text).toContain('Confirm Action');

    const inputRef = extractRef(snap2.text, 'Reason');
    expect(inputRef).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'typeText', ref: inputRef, text: 'testing' });

    const confirmRef = extractRef(snap2.text, 'Confirm');
    expect(confirmRef).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref: confirmRef });

    await new Promise(r => setTimeout(r, 300));

    const result = await page.evaluate(() => document.getElementById('result')?.textContent);
    expect(result).toBe('Confirmed: testing');
  }, 20_000);

  // ---- Tab interface ----

  it('should switch tabs and interact with tab panel content', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/tabs`);

    // Initially Tab 1 is active
    const snap1 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap1.text).toContain('Tab1 input');

    // Tab 2 content should be hidden (display:none)
    expect(snap1.text).not.toContain('Tab 2 Action');

    // Click Tab 2
    const tab2Ref = extractRef(snap1.text, 'Tab 2');
    expect(tab2Ref).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref: tab2Ref });
    await new Promise(r => setTimeout(r, 300));

    // Re-snapshot should show Tab 2 content
    const snap2 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap2.text).toContain('Tab 2 Action');
    // Tab 1 input should now be hidden
    expect(snap2.text).not.toContain('Tab1 input');
  }, 20_000);

  // ---- Special characters ----

  it('should handle Unicode text in typeText', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/special`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = extractRef(snap.text, 'Unicode input');
    expect(ref).toBeTruthy();

    const result = await sendToContentScript(browser, page, {
      action: 'typeText', ref, text: 'こんにちは世界 🌍',
    });
    expect(result.success).toBe(true);

    const val = await page.evaluate(() => (document.getElementById('unicode-input') as HTMLInputElement).value);
    expect(val).toBe('こんにちは世界 🌍');
  }, 15_000);

  it('should handle HTML-like characters in typeText without injection', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/special`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = extractRef(snap.text, 'HTML entities');
    expect(ref).toBeTruthy();

    const text = '<script>alert("xss")</script> & "quotes"';
    await sendToContentScript(browser, page, { action: 'typeText', ref, text });

    const val = await page.evaluate(() => (document.getElementById('html-input') as HTMLInputElement).value);
    expect(val).toBe(text);
  }, 15_000);

  it('should type multi-line text into textarea', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/special`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = extractRef(snap.text, 'Multi-line text');
    expect(ref).toBeTruthy();

    const multiLine = 'Line 1\nLine 2\nLine 3';
    await sendToContentScript(browser, page, { action: 'typeText', ref, text: multiLine });

    const val = await page.evaluate(() => (document.getElementById('multiline-ta') as HTMLTextAreaElement).value);
    expect(val).toBe(multiLine);
  }, 15_000);

  // ---- Table interactions ----

  it('should interact with specific rows in a table', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/table`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Click Edit on Row 2
    const editRef = extractRef(snap.text, 'Edit Row 2');
    expect(editRef).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref: editRef });

    const output = await page.evaluate(() => document.getElementById('table-output')?.textContent);
    expect(output).toBe('Editing row 2');
  }, 15_000);

  it('should delete a table row and verify it is gone from snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/table`);
    const snap1 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap1.text).toContain('Delete Row 1');

    const delRef = extractRef(snap1.text, 'Delete Row 1');
    expect(delRef).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref: delRef });
    await new Promise(r => setTimeout(r, 300));

    const snap2 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap2.text).not.toContain('Edit Row 1');
    expect(snap2.text).not.toContain('Delete Row 1');
    // Other rows still present
    expect(snap2.text).toContain('Edit Row 2');
  }, 15_000);

  // ---- Link navigation ----

  it('should include anchor links in snapshot and navigate', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/nav`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    expect(snap.text).toContain('Go to Section 1');
    expect(snap.text).toContain('Other Page');
  }, 15_000);

  // ---- Disabled fieldset ----

  it('should show elements inside disabled fieldset as disabled', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/form-states`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Elements in disabled fieldset should be marked disabled
    const fsInputLine = findLine(snap.text, 'Disabled fieldset input');
    expect(fsInputLine).toBeTruthy();
    expect(fsInputLine).toContain('(disabled)');

    // The fieldset button should also be disabled
    const fsBtnLine = findLine(snap.text, 'Fieldset Button');
    expect(fsBtnLine).toBeTruthy();
    expect(fsBtnLine).toContain('(disabled)');
  }, 15_000);

  it('should enable fieldset and then interact with its elements', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/form-states`);
    const snap1 = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Click enable button
    const enableRef = extractRef(snap1.text, 'Enable Fieldset');
    expect(enableRef).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref: enableRef });
    await new Promise(r => setTimeout(r, 300));

    // Re-snapshot - fieldset should no longer be disabled
    const snap2 = await sendToContentScript(browser, page, { action: 'snapshot' });
    const fsInputLine = findLine(snap2.text, 'Disabled fieldset input');
    // After enabling, should NOT contain (disabled)
    expect(fsInputLine).not.toContain('(disabled)');
  }, 15_000);

  it('should fail to click a disabled select element', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/form-states`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const selRef = extractRef(snap.text, 'Disabled select');
    expect(selRef).toBeTruthy();

    const result = await sendToContentScript(browser, page, {
      action: 'click', ref: selRef,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('disabled');
  }, 15_000);

  // ---- Rapid sequential actions ----

  it('should handle rapid sequential snapshot-action cycles', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/`);

    // Simulate an agent doing rapid snapshot → action cycles
    for (let i = 0; i < 5; i++) {
      const snap = await sendToContentScript(browser, page, { action: 'snapshot' });
      expect(snap.snapshotId).toMatch(/^snap-/);
      expect(snap.text).toContain('@e');

      const ref = extractRef(snap.text, 'Email address');
      if (ref) {
        await sendToContentScript(browser, page, {
          action: 'typeText', ref, text: `test${i}`,
        });
      }
    }

    // Verify final value
    const val = await page.evaluate(() => (document.getElementById('email') as HTMLInputElement).value);
    expect(val).toBe('test4');
  }, 30_000);

  // ---- Password field visibility in snapshot ----

  it('should include password field in snapshot as textbox', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Password input should appear in snapshot
    expect(snap.text).toContain('Password');
    const passRef = extractRef(snap.text, 'Password');
    expect(passRef).toBeTruthy();
  }, 15_000);

  // ---- Error recovery: continue after error ----

  it('should continue working after an action error', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Try an invalid action
    const badResult = await sendToContentScript(browser, page, {
      action: 'click', ref: '@e9999',
    });
    expect(badResult.success).toBe(false);

    // Should still be able to do valid actions
    const emailRef = extractRef(snap.text, 'Email address');
    const goodResult = await sendToContentScript(browser, page, {
      action: 'typeText', ref: emailRef, text: 'recovery@test.com',
    });
    expect(goodResult.success).toBe(true);
  }, 15_000);
});

/* ---------- Helpers ---------- */

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

function findLine(snapshotText: string, labelText: string): string | null {
  const lines = snapshotText.split('\n');
  for (const line of lines) {
    if (line.includes(labelText)) return line;
  }
  return null;
}
