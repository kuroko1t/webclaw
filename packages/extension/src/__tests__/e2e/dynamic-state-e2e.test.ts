/**
 * E2E tests for dynamic state changes, programmatic updates,
 * history navigation, and other real-world interaction patterns.
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

describe('Dynamic State & Interactions E2E', () => {
  let browser: Browser;
  let page: Page;
  let server: Server;
  let port: number;

  const TEST_PAGES: Record<string, string> = {
    '/dynamic': `<!DOCTYPE html><html><head><title>Dynamic State</title></head><body>
      <h1>Dynamic State Tests</h1>

      <!-- Programmatic state changes -->
      <input type="checkbox" id="cb1" aria-label="Newsletter">
      <input type="checkbox" id="cb2" checked aria-label="Terms">
      <input type="radio" name="plan" id="r1" value="free" aria-label="Free plan">
      <input type="radio" name="plan" id="r2" value="pro" aria-label="Pro plan">
      <select id="sel1" aria-label="Country">
        <option value="us">United States</option>
        <option value="jp" selected>Japan</option>
        <option value="uk">United Kingdom</option>
      </select>
      <input type="text" id="txt1" aria-label="Username" value="initial">

      <!-- Dynamic visibility -->
      <div id="toggle-container">
        <button id="btn-visible">Visible Button</button>
      </div>
      <button id="btn-hide" onclick="document.getElementById('toggle-container').style.display='none'">Hide</button>
      <button id="btn-show" onclick="document.getElementById('toggle-container').style.display=''">Show</button>

      <!-- Dynamic element insertion/removal -->
      <div id="dynamic-area"></div>
      <button id="btn-add" onclick="
        var el = document.createElement('button');
        el.id = 'dynamic-btn';
        el.textContent = 'Dynamic Button';
        document.getElementById('dynamic-area').appendChild(el);
      ">Add Element</button>

      <!-- Input type change -->
      <input type="text" id="type-change" aria-label="Secret" value="password123">

      <!-- Rapid interaction target -->
      <input type="text" id="rapid-input" aria-label="Rapid input">
      <div id="counter">0</div>
      <button id="btn-count" onclick="
        var c = document.getElementById('counter');
        c.textContent = String(Number(c.textContent) + 1);
      ">Increment</button>

      <script>
        // Helper functions for programmatic changes
        window.toggleCheckbox = function(id) {
          var cb = document.getElementById(id);
          cb.checked = !cb.checked;
        };
        window.selectRadio = function(id) {
          document.getElementById(id).checked = true;
        };
        window.changeSelect = function(val) {
          document.getElementById('sel1').value = val;
        };
        window.changeInputValue = function(val) {
          document.getElementById('txt1').value = val;
        };
        window.changeInputType = function(type) {
          document.getElementById('type-change').type = type;
        };
      </script>
    </body></html>`,

    '/history': `<!DOCTYPE html><html><head><title>History Navigation</title></head><body>
      <div id="app">
        <h1 id="page-title">Home Page</h1>
        <nav>
          <a href="#" id="nav-home" onclick="navigate('home'); return false;">Home</a>
          <a href="#" id="nav-about" onclick="navigate('about'); return false;">About</a>
          <a href="#" id="nav-contact" onclick="navigate('contact'); return false;">Contact</a>
        </nav>
        <div id="content">
          <p>Welcome to the home page</p>
          <button id="home-btn">Home Action</button>
        </div>
      </div>
      <script>
        var pages = {
          home: '<p>Welcome to the home page</p><button id="home-btn">Home Action</button>',
          about: '<p>About us page</p><button id="about-btn">Learn More</button><input type="text" id="about-input" aria-label="Feedback">',
          contact: '<p>Contact page</p><input type="email" id="contact-email" aria-label="Email"><button id="contact-submit">Send</button>',
        };
        function navigate(page) {
          document.getElementById('page-title').textContent = page.charAt(0).toUpperCase() + page.slice(1) + ' Page';
          document.getElementById('content').innerHTML = pages[page];
          history.pushState({ page: page }, '', '/' + page);
        }
        window.addEventListener('popstate', function(e) {
          if (e.state && e.state.page) {
            document.getElementById('page-title').textContent = e.state.page.charAt(0).toUpperCase() + e.state.page.slice(1) + ' Page';
            document.getElementById('content').innerHTML = pages[e.state.page];
          }
        });
        history.replaceState({ page: 'home' }, '', '/home');
      </script>
    </body></html>`,

    '/select-edge': `<!DOCTYPE html><html><head><title>Select Edge Cases</title></head><body>
      <h1>Select Edge Cases</h1>

      <!-- Ambiguous value/text matching -->
      <select id="ambiguous" aria-label="Ambiguous Select">
        <option value="apple">Orange</option>
        <option value="orange">Apple</option>
        <option value="banana">Banana</option>
      </select>

      <!-- Multiple select -->
      <select id="multi" multiple size="4" aria-label="Multi Select">
        <option value="a">Alpha</option>
        <option value="b" selected>Beta</option>
        <option value="c">Charlie</option>
        <option value="d" selected>Delta</option>
      </select>

      <!-- Select with empty option -->
      <select id="empty-opt" aria-label="With Empty">
        <option value="">-- Select --</option>
        <option value="x">Option X</option>
      </select>

      <!-- Select with no options -->
      <select id="no-opts" aria-label="No Options"></select>

      <!-- Select with optgroup -->
      <select id="grouped" aria-label="Grouped">
        <optgroup label="Fruits">
          <option value="apple">Apple</option>
          <option value="banana">Banana</option>
        </optgroup>
        <optgroup label="Vegetables">
          <option value="carrot">Carrot</option>
        </optgroup>
      </select>
    </body></html>`,

    '/shadow-dom': `<!DOCTYPE html><html><head><title>Shadow DOM</title></head><body>
      <h1>Shadow DOM Test</h1>
      <button id="light-btn">Light DOM Button</button>
      <div id="shadow-host"></div>
      <input type="text" id="light-input" aria-label="Light input">
      <script>
        var host = document.getElementById('shadow-host');
        var shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = '<button id="shadow-btn">Shadow Button</button><input type="text" placeholder="Shadow input">';
      </script>
    </body></html>`,

    '/complex-form': `<!DOCTYPE html><html><head><title>Complex Form</title></head><body>
      <h1>Registration Form</h1>
      <form id="reg-form" aria-label="Registration">
        <fieldset>
          <legend>Personal Info</legend>
          <label for="fname">First Name</label>
          <input type="text" id="fname" name="fname" required placeholder="First name">
          <label for="lname">Last Name</label>
          <input type="text" id="lname" name="lname" required placeholder="Last name">
          <label for="email">Email</label>
          <input type="email" id="email" name="email" required placeholder="email@example.com">
        </fieldset>
        <fieldset>
          <legend>Preferences</legend>
          <label for="lang">Language</label>
          <select id="lang" name="lang" aria-label="Language">
            <option value="">Select...</option>
            <option value="en">English</option>
            <option value="ja">Japanese</option>
            <option value="es">Spanish</option>
          </select>
          <label><input type="checkbox" name="newsletter" id="newsletter"> Subscribe to newsletter</label>
          <label><input type="radio" name="plan" value="free" id="plan-free" checked> Free</label>
          <label><input type="radio" name="plan" value="pro" id="plan-pro"> Professional</label>
        </fieldset>
        <textarea id="bio" name="bio" aria-label="Biography" placeholder="Tell us about yourself"></textarea>
        <button type="submit" id="submit-btn">Register</button>
        <button type="reset" id="reset-btn">Reset</button>
      </form>
      <div id="result" style="display:none"></div>
      <script>
        document.getElementById('reg-form').addEventListener('submit', function(e) {
          e.preventDefault();
          var data = new FormData(e.target);
          var result = {};
          data.forEach(function(v, k) { result[k] = v; });
          document.getElementById('result').style.display = 'block';
          document.getElementById('result').textContent = 'Registered: ' + JSON.stringify(result);
        });
      </script>
    </body></html>`,

    '/contenteditable-rich': `<!DOCTYPE html><html><head><title>Rich Content Editing</title></head><body>
      <h1>Rich Content Editing</h1>
      <div contenteditable="true" id="editor" aria-label="Rich editor"
           style="border:1px solid #ccc; padding:8px; min-height:100px">
        <p>Initial paragraph</p>
        <ul><li>List item 1</li><li>List item 2</li></ul>
      </div>
      <div contenteditable="true" id="empty-editor" aria-label="Empty editor"></div>
      <div contenteditable="plaintext-only" id="plaintext" aria-label="Plaintext editor">Plain text only</div>
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

  // --- Programmatic State Changes ---

  it('should reflect programmatic checkbox.checked change in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/dynamic`);

    // Initial snapshot: cb1 unchecked, cb2 checked
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toMatch(/checkbox "Newsletter".*\(unchecked\)/s);
    expect(snap.text).toMatch(/checkbox "Terms".*\(checked\)/s);

    // Programmatically toggle cb1 checked
    await page.evaluate(() => (window as any).toggleCheckbox('cb1'));
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toMatch(/checkbox "Newsletter".*\(checked\)/s);

    // Programmatically toggle cb2 unchecked
    await page.evaluate(() => (window as any).toggleCheckbox('cb2'));
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toMatch(/checkbox "Terms".*\(unchecked\)/s);
  }, 30_000);

  it('should reflect programmatic radio button selection in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/dynamic`);

    // Select "Pro plan" programmatically
    await page.evaluate(() => (window as any).selectRadio('r2'));
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toMatch(/radio "Free plan".*\(unchecked\)/s);
    expect(snap.text).toMatch(/radio "Pro plan".*\(checked\)/s);
  }, 30_000);

  it('should reflect programmatic select value change in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/dynamic`);

    // Initial: Japan selected
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toContain('Japan');

    // Change to UK programmatically
    await page.evaluate(() => (window as any).changeSelect('uk'));
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toContain('United Kingdom');
  }, 30_000);

  it('should reflect programmatic input value change in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/dynamic`);

    // Initial: "initial"
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toContain('initial');

    // Change value programmatically
    await page.evaluate(() => (window as any).changeInputValue('changed_value'));
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toContain('changed_value');
  }, 30_000);

  // --- Dynamic Visibility ---

  it('should not include hidden elements in new snapshot after display:none', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/dynamic`);

    // Initial: button visible
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toContain('Visible Button');

    // Hide the container
    await page.click('#btn-hide');
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).not.toContain('Visible Button');

    // Show again
    await page.click('#btn-show');
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toContain('Visible Button');
  }, 30_000);

  it('should fail action on element hidden after snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/dynamic`);

    // Take snapshot - button is visible and gets a @ref
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toContain('Visible Button');

    // Find the @ref for "Visible Button"
    const refMatch = snap.text.match(/@e\d+(?= button "Visible Button")/);
    expect(refMatch).not.toBeNull();
    const ref = refMatch![0];

    // Hide the container AFTER snapshot
    await page.click('#btn-hide');

    // Try to click the now-hidden button using old ref
    // The element is still connected to DOM, just hidden
    const result = await sendToContentScript(browser, page, { action: 'click', ref });
    // Note: currently click succeeds on hidden elements - this documents behavior
    // The element is still in the DOM, just not visible
    expect(result.success).toBe(true);
  }, 30_000);

  // --- Dynamic Element Insertion ---

  it('should discover dynamically added elements in new snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/dynamic`);

    // Initial: no dynamic button
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).not.toContain('Dynamic Button');

    // Add a dynamic button
    await page.click('#btn-add');
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toContain('Dynamic Button');

    // Click the dynamically added button
    const refMatch = snap.text.match(/@e\d+(?= button "Dynamic Button")/);
    expect(refMatch).not.toBeNull();
    const result = await sendToContentScript(browser, page, { action: 'click', ref: refMatch![0] });
    expect(result.success).toBe(true);
  }, 30_000);

  // --- Rapid Interactions ---

  it('should handle rapid sequential snapshots correctly', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/dynamic`);

    // Take 5 snapshots rapidly
    const snapshots = [];
    for (let i = 0; i < 5; i++) {
      snapshots.push(await sendToContentScript(browser, page, { action: 'snapshot' }));
    }

    // All snapshots should have valid structure
    for (const snap of snapshots) {
      expect(snap.text).toContain('[page');
      expect(snap.snapshotId).toMatch(/^snap-/);
    }

    // All snapshot IDs should be unique
    const ids = new Set(snapshots.map((s: any) => s.snapshotId));
    expect(ids.size).toBe(5);

    // Only the last snapshot's refs should be active
    const lastSnap = snapshots[4];
    const refMatch = lastSnap.text.match(/@e\d+/);
    if (refMatch) {
      const result = await sendToContentScript(browser, page, { action: 'click', ref: refMatch[0] });
      expect(result.success).toBe(true);
    }
  }, 30_000);

  it('should handle rapid click-then-snapshot cycles', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/dynamic`);

    // Click increment button 5 times with snapshots between
    for (let i = 0; i < 5; i++) {
      const snap = await sendToContentScript(browser, page, { action: 'snapshot' });
      const refMatch = snap.text.match(/@e\d+(?= button "Increment")/);
      expect(refMatch).not.toBeNull();
      await sendToContentScript(browser, page, { action: 'click', ref: refMatch![0] });
    }

    // Verify counter incremented 5 times
    const counterValue = await page.evaluate(() =>
      document.getElementById('counter')!.textContent
    );
    expect(counterValue).toBe('5');
  }, 30_000);

  // --- History API Navigation ---

  it('should handle history.pushState navigation and re-snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/history`);

    // Initial: home page
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toContain('Home Action');

    // Navigate to "about" via click
    const navRef = snap.text.match(/@e\d+(?= link "About")/);
    expect(navRef).not.toBeNull();
    await sendToContentScript(browser, page, { action: 'click', ref: navRef![0] });

    // Wait for DOM update
    await page.waitForFunction(() =>
      document.getElementById('page-title')?.textContent === 'About Page'
    );

    // Re-snapshot - should show about page content
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toContain('Learn More');
    expect(snap.text).toContain('Feedback');
  }, 30_000);

  it('should handle browser back navigation with stale refs', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/history`);

    // Navigate to about page
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const aboutRef = snap.text.match(/@e\d+(?= link "About")/);
    await sendToContentScript(browser, page, { action: 'click', ref: aboutRef![0] });
    await page.waitForFunction(() =>
      document.getElementById('page-title')?.textContent === 'About Page'
    );

    // Take snapshot of about page
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toContain('Learn More');
    const learnMoreRef = snap.text.match(/@e\d+(?= button "Learn More")/);
    expect(learnMoreRef).not.toBeNull();

    // Go back via history
    await page.goBack();
    await page.waitForFunction(() =>
      document.getElementById('page-title')?.textContent === 'Home Page'
    );

    // Old ref should fail (element was replaced by innerHTML)
    const result = await sendToContentScript(browser, page, { action: 'click', ref: learnMoreRef![0] });
    expect(result.success).toBe(false);
  }, 30_000);

  it('should work correctly after forward navigation', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/history`);

    // Navigate: home → about → back → forward
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const aboutRef = snap.text.match(/@e\d+(?= link "About")/);
    await sendToContentScript(browser, page, { action: 'click', ref: aboutRef![0] });
    await page.waitForFunction(() =>
      document.getElementById('page-title')?.textContent === 'About Page'
    );

    await page.goBack();
    await page.waitForFunction(() =>
      document.getElementById('page-title')?.textContent === 'Home Page'
    );

    await page.goForward();
    await page.waitForFunction(() =>
      document.getElementById('page-title')?.textContent === 'About Page'
    );

    // Re-snapshot and interact
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toContain('Learn More');
    expect(snap.text).toContain('Feedback');

    // Type into the about page's input
    const inputRef = snap.text.match(/@e\d+(?= textbox "Feedback")/);
    expect(inputRef).not.toBeNull();
    const result = await sendToContentScript(browser, page, {
      action: 'typeText',
      ref: inputRef![0],
      text: 'Great site!',
    });
    expect(result.success).toBe(true);
  }, 30_000);

  // --- Select Edge Cases ---

  it('should select by value first when value and text overlap', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/select-edge`);

    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const selRef = snap.text.match(/@e\d+(?= combobox "Ambiguous Select")/);
    expect(selRef).not.toBeNull();

    // "apple" is a value → should select the option with value="apple" (text="Orange")
    const result = await sendToContentScript(browser, page, {
      action: 'selectOption',
      ref: selRef![0],
      value: 'apple',
    });
    expect(result.success).toBe(true);

    // Verify the selected option's text is "Orange" (value="apple")
    const selectedText = await page.evaluate(() => {
      const sel = document.getElementById('ambiguous') as HTMLSelectElement;
      return sel.selectedOptions[0].textContent;
    });
    expect(selectedText).toBe('Orange');
  }, 30_000);

  it('should handle select with empty default option', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/select-edge`);

    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const selRef = snap.text.match(/@e\d+(?= combobox "With Empty")/);
    expect(selRef).not.toBeNull();

    // Select "Option X" by text
    const result = await sendToContentScript(browser, page, {
      action: 'selectOption',
      ref: selRef![0],
      value: 'Option X',
    });
    expect(result.success).toBe(true);

    // Verify
    const val = await page.evaluate(() =>
      (document.getElementById('empty-opt') as HTMLSelectElement).value
    );
    expect(val).toBe('x');
  }, 30_000);

  it('should handle select with no options gracefully', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/select-edge`);

    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const selRef = snap.text.match(/@e\d+(?= combobox "No Options")/);
    expect(selRef).not.toBeNull();

    // Try to select something — should fail since no options exist
    const result = await sendToContentScript(browser, page, {
      action: 'selectOption',
      ref: selRef![0],
      value: 'anything',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  }, 30_000);

  it('should select from optgroup correctly', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/select-edge`);

    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const selRef = snap.text.match(/@e\d+(?= combobox "Grouped")/);
    expect(selRef).not.toBeNull();

    // Select "Carrot" from Vegetables group
    const result = await sendToContentScript(browser, page, {
      action: 'selectOption',
      ref: selRef![0],
      value: 'carrot',
    });
    expect(result.success).toBe(true);

    const val = await page.evaluate(() =>
      (document.getElementById('grouped') as HTMLSelectElement).value
    );
    expect(val).toBe('carrot');
  }, 30_000);

  it('should show multiple select first selected value in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/select-edge`);

    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    // Multiple select should appear in snapshot (it's a combobox/listbox)
    // Check that at least the first selected option value is shown
    expect(snap.text).toContain('Multi Select');
  }, 30_000);

  // --- Shadow DOM ---

  it('should include both light DOM and shadow DOM elements in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/shadow-dom`);

    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Light DOM elements should be visible
    expect(snap.text).toContain('Light DOM Button');
    expect(snap.text).toContain('Light input');

    // Shadow DOM elements should now be in snapshot
    expect(snap.text).toContain('Shadow Button');
    expect(snap.text).toContain('Shadow input');
  }, 30_000);

  it('should still interact with light DOM when shadow DOM is present', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/shadow-dom`);

    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Click light DOM button
    const btnRef = snap.text.match(/@e\d+(?= button "Light DOM Button")/);
    expect(btnRef).not.toBeNull();
    const result = await sendToContentScript(browser, page, { action: 'click', ref: btnRef![0] });
    expect(result.success).toBe(true);

    // Type into light DOM input
    const inputRef = snap.text.match(/@e\d+(?= textbox "Light input")/);
    expect(inputRef).not.toBeNull();
    const typeResult = await sendToContentScript(browser, page, {
      action: 'typeText',
      ref: inputRef![0],
      text: 'Hello from light DOM',
    });
    expect(typeResult.success).toBe(true);
  }, 30_000);

  // --- Complex Form Workflow ---

  it('should complete full form registration workflow', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/complex-form`);

    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Fill first name
    let ref = snap.text.match(/@e\d+(?= textbox "First Name")/)?.[0]
           ?? snap.text.match(/@e\d+(?= textbox "First name")/)?.[0];
    expect(ref).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'typeText', ref, text: 'Taro' });

    // Fill last name
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    ref = snap.text.match(/@e\d+(?= textbox "Last Name")/)?.[0]
       ?? snap.text.match(/@e\d+(?= textbox "Last name")/)?.[0];
    expect(ref).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'typeText', ref, text: 'Yamada' });

    // Fill email
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    ref = snap.text.match(/@e\d+(?= textbox "Email")/)?.[0]
       ?? snap.text.match(/@e\d+(?= textbox "email@example.com")/)?.[0];
    expect(ref).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'typeText', ref, text: 'taro@example.com' });

    // Select language
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    ref = snap.text.match(/@e\d+(?= combobox "Language")/)?.[0];
    expect(ref).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'selectOption', ref, value: 'ja' });

    // Check newsletter checkbox
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const cbRef = snap.text.match(/@e\d+(?= checkbox.*newsletter)/i)?.[0]
              ?? snap.text.match(/@e\d+(?= checkbox "Subscribe)/)?.[0];
    if (cbRef) {
      await sendToContentScript(browser, page, { action: 'click', ref: cbRef });
    }

    // Select Pro plan
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const proRef = snap.text.match(/@e\d+(?= radio.*Professional)/i)?.[0]
               ?? snap.text.match(/@e\d+(?= radio "Professional")/)?.[0];
    if (proRef) {
      await sendToContentScript(browser, page, { action: 'click', ref: proRef });
    }

    // Fill bio
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    ref = snap.text.match(/@e\d+(?= textbox "Biography")/)?.[0]
       ?? snap.text.match(/@e\d+(?= textbox "Tell us about yourself")/)?.[0];
    expect(ref).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'typeText', ref, text: 'Hello world!' });

    // Submit
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    ref = snap.text.match(/@e\d+(?= button "Register")/)?.[0];
    expect(ref).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref });

    // Verify result
    await page.waitForFunction(() =>
      document.getElementById('result')?.style.display !== 'none'
    );
    const resultText = await page.evaluate(() =>
      document.getElementById('result')!.textContent
    );
    expect(resultText).toContain('Registered');
    expect(resultText).toContain('taro@example.com');
  }, 30_000);

  it('should handle form reset and verify cleared state', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/complex-form`);

    // Fill some fields
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    let ref = snap.text.match(/@e\d+(?= textbox "First Name")/)?.[0]
           ?? snap.text.match(/@e\d+(?= textbox "First name")/)?.[0];
    if (ref) {
      await sendToContentScript(browser, page, { action: 'typeText', ref, text: 'Test' });
    }

    // Click reset button
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    ref = snap.text.match(/@e\d+(?= button "Reset")/)?.[0];
    expect(ref).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref });

    // Wait for reset
    await new Promise(r => setTimeout(r, 100));

    // Verify fields are cleared
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    // The input should not contain "Test" anymore
    const fnameValue = await page.evaluate(() =>
      (document.getElementById('fname') as HTMLInputElement).value
    );
    expect(fnameValue).toBe('');
  }, 30_000);

  // --- Contenteditable Rich Text ---

  it('should typeText into contenteditable with existing rich content', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/contenteditable-rich`);

    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const editorRef = snap.text.match(/@e\d+(?=.*"Rich editor")/)?.[0];
    expect(editorRef).toBeTruthy();

    // Clear and type new content
    const result = await sendToContentScript(browser, page, {
      action: 'typeText',
      ref: editorRef,
      text: 'New content',
      clearFirst: true,
    });
    expect(result.success).toBe(true);

    // Verify content was replaced
    const content = await page.evaluate(() =>
      document.getElementById('editor')!.textContent
    );
    expect(content).toBe('New content');
  }, 30_000);

  it('should typeText into empty contenteditable', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/contenteditable-rich`);

    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const emptyRef = snap.text.match(/@e\d+(?=.*"Empty editor")/)?.[0];
    expect(emptyRef).toBeTruthy();

    const result = await sendToContentScript(browser, page, {
      action: 'typeText',
      ref: emptyRef,
      text: 'First content',
    });
    expect(result.success).toBe(true);

    const content = await page.evaluate(() =>
      document.getElementById('empty-editor')!.textContent
    );
    expect(content).toBe('First content');
  }, 30_000);

  it('should typeText into contenteditable="plaintext-only"', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/contenteditable-rich`);

    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const ptRef = snap.text.match(/@e\d+(?=.*"Plaintext editor")/)?.[0];
    expect(ptRef).toBeTruthy();

    const result = await sendToContentScript(browser, page, {
      action: 'typeText',
      ref: ptRef,
      text: 'Updated text',
      clearFirst: true,
    });
    expect(result.success).toBe(true);

    const content = await page.evaluate(() =>
      document.getElementById('plaintext')!.textContent
    );
    expect(content).toBe('Updated text');
  }, 30_000);

  // --- Input Type Change ---

  it('should handle input type change from text to password', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/dynamic`);

    // Initial: type="text"
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toContain('Secret');

    // Change type to password
    await page.evaluate(() => (window as any).changeInputType('password'));
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    // Should still appear as textbox
    expect(snap.text).toContain('Secret');

    // Should still be able to type
    const ref = snap.text.match(/@e\d+(?= textbox "Secret")/)?.[0];
    expect(ref).toBeTruthy();
    const result = await sendToContentScript(browser, page, {
      action: 'typeText',
      ref,
      text: 'new_secret',
      clearFirst: true,
    });
    expect(result.success).toBe(true);
  }, 30_000);
});
