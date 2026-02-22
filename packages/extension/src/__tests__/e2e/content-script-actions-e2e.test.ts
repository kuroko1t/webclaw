/**
 * E2E tests for content script action handling edge cases:
 * - Unknown actions
 * - contenteditable append mode (clearFirst=false)
 * - typeText clearFirst parameter
 * - Snapshot with empty/minimal pages
 * - Multiple sequential actions without re-snapshot
 * - Action on elements that change type/role dynamically
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

describe('Content Script Actions E2E', () => {
  let browser: Browser;
  let page: Page;
  let server: Server;
  let port: number;

  const TEST_PAGES: Record<string, string> = {
    '/actions': `<!DOCTYPE html><html><head><title>Action Tests</title></head><body>
      <h1>Action Edge Cases</h1>

      <!-- contenteditable elements for append testing -->
      <div contenteditable="true" id="ce-div" aria-label="Rich editor"
           style="border:1px solid #ccc; padding:8px; min-height:50px">Initial content</div>

      <div contenteditable="true" id="ce-empty" aria-label="Empty editor"
           style="border:1px solid #ccc; padding:8px; min-height:50px"></div>

      <!-- Regular inputs for clearFirst testing -->
      <input type="text" id="text-input" aria-label="Text field" value="existing">
      <textarea id="textarea" aria-label="Notes">existing notes</textarea>

      <!-- Elements that change dynamically -->
      <input type="text" id="dynamic-input" aria-label="Dynamic field" value="">
      <button id="make-disabled" onclick="
        document.getElementById('dynamic-input').disabled = true;
      ">Disable Input</button>
      <button id="make-enabled" onclick="
        document.getElementById('dynamic-input').disabled = false;
      ">Enable Input</button>

      <div id="result"></div>
    </body></html>`,

    '/empty-page': `<!DOCTYPE html><html><head><title>Empty Page</title></head><body></body></html>`,

    '/minimal': `<!DOCTYPE html><html><head><title>Minimal</title></head><body>
      <p>Just text, no interactive elements at all.</p>
    </body></html>`,

    '/multi-step': `<!DOCTYPE html><html><head><title>Multi-Step Form</title>
      <style>
        .step { display: none; }
        .step.active { display: block; }
      </style>
    </head><body>
      <h1>Registration Wizard</h1>
      <div class="step active" id="step1">
        <h2>Step 1: Account</h2>
        <input type="email" id="email" aria-label="Email" placeholder="you@example.com">
        <input type="password" id="password" aria-label="Password">
        <button id="next1" onclick="goToStep(2)">Next</button>
      </div>
      <div class="step" id="step2">
        <h2>Step 2: Profile</h2>
        <input type="text" id="name" aria-label="Full name">
        <select id="country" aria-label="Country">
          <option value="">Select...</option>
          <option value="us">United States</option>
          <option value="jp">Japan</option>
          <option value="de">Germany</option>
        </select>
        <button id="back2" onclick="goToStep(1)">Back</button>
        <button id="next2" onclick="goToStep(3)">Next</button>
      </div>
      <div class="step" id="step3">
        <h2>Step 3: Confirm</h2>
        <div id="summary"></div>
        <label><input type="checkbox" id="agree"> I agree to the terms</label>
        <button id="back3" onclick="goToStep(2)">Back</button>
        <button id="submit" onclick="submitForm()">Submit</button>
      </div>
      <div id="result" style="display:none">
        <h2>Success!</h2>
        <p id="result-text"></p>
      </div>

      <script>
        function goToStep(n) {
          document.querySelectorAll('.step').forEach(function(s) {
            s.classList.remove('active');
          });
          document.getElementById('step' + n).classList.add('active');
          if (n === 3) {
            document.getElementById('summary').textContent =
              'Email: ' + document.getElementById('email').value +
              ', Name: ' + document.getElementById('name').value +
              ', Country: ' + document.getElementById('country').selectedOptions[0].text;
          }
        }
        function submitForm() {
          if (!document.getElementById('agree').checked) {
            alert('Please agree to the terms');
            return;
          }
          document.querySelectorAll('.step').forEach(function(s) {
            s.classList.remove('active');
          });
          document.getElementById('result').style.display = 'block';
          document.getElementById('result-text').textContent =
            'Registered ' + document.getElementById('email').value;
        }
      </script>
    </body></html>`,

    '/search-filter': `<!DOCTYPE html><html><head><title>Search & Filter</title>
      <style>
        .item { padding: 8px; border-bottom: 1px solid #eee; }
        .item.hidden { display: none; }
      </style>
    </head><body>
      <h1>Product Catalog</h1>
      <div>
        <input type="search" id="search" aria-label="Search products"
               oninput="filterProducts()">
        <select id="category" aria-label="Category" onchange="filterProducts()">
          <option value="">All</option>
          <option value="electronics">Electronics</option>
          <option value="books">Books</option>
          <option value="clothing">Clothing</option>
        </select>
        <select id="sort" aria-label="Sort by" onchange="sortProducts()">
          <option value="name">Name A-Z</option>
          <option value="price-asc">Price: Low to High</option>
          <option value="price-desc">Price: High to Low</option>
        </select>
      </div>
      <div id="results-count" role="status" aria-live="polite"></div>
      <div id="product-list">
        <div class="item" data-cat="electronics" data-price="999" data-name="Laptop">
          <strong>Laptop</strong> - $999 <button onclick="addToCart('Laptop')">Add to Cart</button>
        </div>
        <div class="item" data-cat="electronics" data-price="699" data-name="Phone">
          <strong>Phone</strong> - $699 <button onclick="addToCart('Phone')">Add to Cart</button>
        </div>
        <div class="item" data-cat="books" data-price="29" data-name="JavaScript Guide">
          <strong>JavaScript Guide</strong> - $29 <button onclick="addToCart('JavaScript Guide')">Add to Cart</button>
        </div>
        <div class="item" data-cat="books" data-price="39" data-name="Python Handbook">
          <strong>Python Handbook</strong> - $39 <button onclick="addToCart('Python Handbook')">Add to Cart</button>
        </div>
        <div class="item" data-cat="clothing" data-price="49" data-name="T-Shirt">
          <strong>T-Shirt</strong> - $49 <button onclick="addToCart('T-Shirt')">Add to Cart</button>
        </div>
      </div>
      <div id="cart"></div>

      <script>
        var cart = [];
        function filterProducts() {
          var query = document.getElementById('search').value.toLowerCase();
          var cat = document.getElementById('category').value;
          var items = document.querySelectorAll('.item');
          var visible = 0;
          items.forEach(function(item) {
            var nameMatch = item.getAttribute('data-name').toLowerCase().includes(query);
            var catMatch = !cat || item.getAttribute('data-cat') === cat;
            if (nameMatch && catMatch) {
              item.classList.remove('hidden');
              visible++;
            } else {
              item.classList.add('hidden');
            }
          });
          document.getElementById('results-count').textContent = visible + ' products found';
        }
        function sortProducts() {
          var sortBy = document.getElementById('sort').value;
          var list = document.getElementById('product-list');
          var items = Array.from(list.querySelectorAll('.item'));
          items.sort(function(a, b) {
            if (sortBy === 'name') return a.getAttribute('data-name').localeCompare(b.getAttribute('data-name'));
            if (sortBy === 'price-asc') return Number(a.getAttribute('data-price')) - Number(b.getAttribute('data-price'));
            if (sortBy === 'price-desc') return Number(b.getAttribute('data-price')) - Number(a.getAttribute('data-price'));
            return 0;
          });
          items.forEach(function(item) { list.appendChild(item); });
        }
        function addToCart(name) {
          cart.push(name);
          document.getElementById('cart').textContent = 'Cart (' + cart.length + '): ' + cart.join(', ');
        }
        filterProducts();
      </script>
    </body></html>`,

    '/conflicting-ids': `<!DOCTYPE html><html><head><title>Conflicting IDs</title></head><body>
      <h1>Multiple Forms</h1>

      <!-- Two forms with similar structure -->
      <form id="form1" aria-label="Login Form">
        <input type="text" id="username" aria-label="Login Username">
        <input type="password" id="password" aria-label="Login Password">
        <button type="button" id="login-btn" onclick="
          document.getElementById('result1').textContent =
            'Login: ' + document.getElementById('username').value;
        ">Login</button>
        <div id="result1"></div>
      </form>

      <form id="form2" aria-label="Register Form">
        <input type="text" id="reg-user" aria-label="Register Username">
        <input type="email" id="reg-email" aria-label="Register Email">
        <button type="button" id="reg-btn" onclick="
          document.getElementById('result2').textContent =
            'Register: ' + document.getElementById('reg-user').value;
        ">Register</button>
        <div id="result2"></div>
      </form>
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

  // --- Unknown Action ---

  it('should return error for unknown action type', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/actions`);
    const result = await sendToContentScript(browser, page, { action: 'nonexistent' });
    expect(result.error).toContain('Unknown action');
  }, 30_000);

  it('should return error for empty action', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/actions`);
    const result = await sendToContentScript(browser, page, { action: '' });
    expect(result.error).toContain('Unknown action');
  }, 30_000);

  // --- ContentEditable Append ---

  it('should append text to contenteditable with clearFirst=false', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/actions`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = snap.text.match(/@e\d+(?= generic "Rich editor")/)?.[0];
    expect(ref).toBeTruthy();

    // Append text without clearing
    const result = await sendToContentScript(browser, page, {
      action: 'typeText', ref, text: ' appended', clearFirst: false,
    });
    expect(result.success).toBe(true);

    const text = await page.evaluate(() =>
      document.getElementById('ce-div')!.textContent
    );
    expect(text).toContain('Initial content');
    expect(text).toContain('appended');
  }, 30_000);

  it('should clear contenteditable and type new text with clearFirst=true', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/actions`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = snap.text.match(/@e\d+(?= generic "Rich editor")/)?.[0];
    expect(ref).toBeTruthy();

    const result = await sendToContentScript(browser, page, {
      action: 'typeText', ref, text: 'Replaced',
    });
    expect(result.success).toBe(true);

    const text = await page.evaluate(() =>
      document.getElementById('ce-div')!.textContent
    );
    expect(text).toBe('Replaced');
    expect(text).not.toContain('Initial content');
  }, 30_000);

  it('should type into empty contenteditable', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/actions`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = snap.text.match(/@e\d+(?= generic "Empty editor")/)?.[0];
    expect(ref).toBeTruthy();

    const result = await sendToContentScript(browser, page, {
      action: 'typeText', ref, text: 'New content',
    });
    expect(result.success).toBe(true);

    const text = await page.evaluate(() =>
      document.getElementById('ce-empty')!.textContent
    );
    expect(text).toBe('New content');
  }, 30_000);

  // --- Regular Input clearFirst ---

  it('should append to existing input value with clearFirst=false', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/actions`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = snap.text.match(/@e\d+(?= textbox "Text field")/)?.[0];
    expect(ref).toBeTruthy();

    await sendToContentScript(browser, page, {
      action: 'typeText', ref, text: '-appended', clearFirst: false,
    });

    const value = await page.evaluate(() =>
      (document.getElementById('text-input') as HTMLInputElement).value
    );
    expect(value).toBe('existing-appended');
  }, 30_000);

  it('should append to textarea with clearFirst=false', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/actions`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = snap.text.match(/@e\d+(?= textbox "Notes")/)?.[0];
    expect(ref).toBeTruthy();

    await sendToContentScript(browser, page, {
      action: 'typeText', ref, text: '\nmore notes', clearFirst: false,
    });

    const value = await page.evaluate(() =>
      (document.getElementById('textarea') as HTMLTextAreaElement).value
    );
    expect(value).toContain('existing notes');
    expect(value).toContain('more notes');
  }, 30_000);

  // --- Dynamic Element State ---

  it('should fail to type into dynamically disabled input', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/actions`);
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Type something first (should succeed)
    const ref = snap.text.match(/@e\d+(?= textbox "Dynamic field")/)?.[0];
    expect(ref).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'typeText', ref, text: 'hello' });

    // Disable the input via button click
    const disableRef = snap.text.match(/@e\d+(?= button "Disable Input")/)?.[0];
    await sendToContentScript(browser, page, { action: 'click', ref: disableRef });

    // Re-snapshot to verify disabled state
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const inputLine = snap.text.split('\n').find((l: string) =>
      l.includes('Dynamic field')
    );
    expect(inputLine).toContain('(disabled)');

    // Try to type - should fail
    const newRef = snap.text.match(/@e\d+(?= textbox "Dynamic field")/)?.[0];
    const result = await sendToContentScript(browser, page, {
      action: 'typeText', ref: newRef, text: 'should fail',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('disabled');
  }, 30_000);

  // --- Empty / Minimal Pages ---

  it('should take snapshot of empty page body', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/empty-page`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    expect(snap.text).toContain('[page "Empty Page"]');
    // Should have no @refs
    expect(snap.text).not.toContain('@e');
  }, 30_000);

  it('should take snapshot of page with no interactive elements', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/minimal`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    expect(snap.text).toContain('[page "Minimal"]');
    expect(snap.text).not.toContain('@e');
  }, 30_000);

  // --- Multi-Step Form Wizard ---

  it('should complete multi-step form wizard', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/multi-step`);

    // Step 1: Fill email and password
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toContain('Step 1');

    const emailRef = snap.text.match(/@e\d+(?= textbox "Email")/)?.[0];
    await sendToContentScript(browser, page, {
      action: 'typeText', ref: emailRef, text: 'user@test.com',
    });

    const pwRef = snap.text.match(/@e\d+(?= textbox "Password")/)?.[0];
    await sendToContentScript(browser, page, {
      action: 'typeText', ref: pwRef, text: 'secret123',
    });

    // Click Next
    const next1Ref = snap.text.match(/@e\d+(?= button "Next")/)?.[0];
    await sendToContentScript(browser, page, { action: 'click', ref: next1Ref });

    // Step 2: Fill name and select country
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toContain('Step 2');
    // Step 1 should be hidden
    expect(snap.text).not.toContain('Step 1');

    const nameRef = snap.text.match(/@e\d+(?= textbox "Full name")/)?.[0];
    await sendToContentScript(browser, page, {
      action: 'typeText', ref: nameRef, text: 'Test User',
    });

    const countryRef = snap.text.match(/@e\d+(?= combobox "Country")/)?.[0];
    await sendToContentScript(browser, page, {
      action: 'selectOption', ref: countryRef, value: 'Japan',
    });

    // Click Next
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const next2Ref = snap.text.match(/@e\d+(?= button "Next")/)?.[0];
    await sendToContentScript(browser, page, { action: 'click', ref: next2Ref });

    // Step 3: Verify summary, agree, submit
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toContain('Step 3');
    // Summary text is in a plain <div> with no role - verify via DOM
    const summary = await page.evaluate(() =>
      document.getElementById('summary')!.textContent
    );
    expect(summary).toContain('user@test.com');

    // Check agree checkbox
    const agreeRef = snap.text.match(/@e\d+(?= checkbox)/)?.[0];
    await sendToContentScript(browser, page, { action: 'click', ref: agreeRef });

    // Click Submit
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const submitRef = snap.text.match(/@e\d+(?= button "Submit")/)?.[0];
    await sendToContentScript(browser, page, { action: 'click', ref: submitRef });

    // Verify success via DOM (result text is in plain divs)
    const resultText = await page.evaluate(() =>
      document.getElementById('result-text')!.textContent
    );
    expect(resultText).toContain('user@test.com');
  }, 30_000);

  it('should navigate back in multi-step form and retain values', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/multi-step`);

    // Step 1: Fill email
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const emailRef = snap.text.match(/@e\d+(?= textbox "Email")/)?.[0];
    await sendToContentScript(browser, page, {
      action: 'typeText', ref: emailRef, text: 'back@test.com',
    });

    // Go to step 2
    const next1Ref = snap.text.match(/@e\d+(?= button "Next")/)?.[0];
    await sendToContentScript(browser, page, { action: 'click', ref: next1Ref });

    // Go back to step 1
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const backRef = snap.text.match(/@e\d+(?= button "Back")/)?.[0];
    await sendToContentScript(browser, page, { action: 'click', ref: backRef });

    // Verify email value is retained
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toContain('Step 1');

    const emailValue = await page.evaluate(() =>
      (document.getElementById('email') as HTMLInputElement).value
    );
    expect(emailValue).toBe('back@test.com');
  }, 30_000);

  // --- Search, Filter, and Select Workflow ---

  it('should search, filter by category, and add to cart', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/search-filter`);
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // All 5 products should be visible initially (5 "Add to Cart" buttons)
    expect(snap.text).toContain('5 products found');
    const allBtns = snap.text.match(/@e\d+(?= button "Add to Cart")/g);
    expect(allBtns).toHaveLength(5);

    // Filter by category: Electronics
    const catRef = snap.text.match(/@e\d+(?= combobox "Category")/)?.[0];
    await sendToContentScript(browser, page, {
      action: 'selectOption', ref: catRef, value: 'Electronics',
    });

    // Re-snapshot: only 2 electronics items should be visible
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toContain('2 products found');
    const filteredBtns = snap.text.match(/@e\d+(?= button "Add to Cart")/g);
    expect(filteredBtns).toHaveLength(2);

    // Add first item to cart (Laptop, since it's first in DOM order)
    await sendToContentScript(browser, page, { action: 'click', ref: filteredBtns![0] });

    const cart = await page.evaluate(() =>
      document.getElementById('cart')!.textContent
    );
    expect(cart).toContain('Laptop');
  }, 30_000);

  it('should search by text and show filtered results', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/search-filter`);
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Search for "python"
    const searchRef = snap.text.match(/@e\d+(?= searchbox "Search products")/)?.[0];
    await sendToContentScript(browser, page, {
      action: 'typeText', ref: searchRef, text: 'python',
    });

    // Re-snapshot: only 1 product should be visible (1 "Add to Cart" button)
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toContain('1 products found');
    const filteredBtns = snap.text.match(/@e\d+(?= button "Add to Cart")/g);
    expect(filteredBtns).toHaveLength(1);

    // Verify the visible product is Python Handbook via DOM
    const visibleProduct = await page.evaluate(() => {
      const items = document.querySelectorAll('.item');
      for (const item of items) {
        if (!item.classList.contains('hidden')) {
          return item.querySelector('strong')?.textContent;
        }
      }
      return null;
    });
    expect(visibleProduct).toBe('Python Handbook');
  }, 30_000);

  // --- Multiple Forms ---

  it('should interact with correct form when page has multiple forms', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/conflicting-ids`);
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Fill login form
    const loginRef = snap.text.match(/@e\d+(?= textbox "Login Username")/)?.[0];
    await sendToContentScript(browser, page, {
      action: 'typeText', ref: loginRef, text: 'admin',
    });

    // Fill register form
    const regRef = snap.text.match(/@e\d+(?= textbox "Register Username")/)?.[0];
    await sendToContentScript(browser, page, {
      action: 'typeText', ref: regRef, text: 'newuser',
    });

    // Click login button
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const loginBtnRef = snap.text.match(/@e\d+(?= button "Login")/)?.[0];
    await sendToContentScript(browser, page, { action: 'click', ref: loginBtnRef });

    // Verify only login form was submitted
    const loginResult = await page.evaluate(() =>
      document.getElementById('result1')!.textContent
    );
    expect(loginResult).toContain('Login: admin');

    // Register form should be untouched
    const regResult = await page.evaluate(() =>
      document.getElementById('result2')!.textContent
    );
    expect(regResult).toBe('');

    // Now submit register form
    const regBtnRef = snap.text.match(/@e\d+(?= button "Register")/)?.[0];
    await sendToContentScript(browser, page, { action: 'click', ref: regBtnRef });

    const regResult2 = await page.evaluate(() =>
      document.getElementById('result2')!.textContent
    );
    expect(regResult2).toContain('Register: newuser');
  }, 30_000);

  // --- Multiple Actions Without Re-Snapshot ---

  it('should execute multiple actions using same snapshot refs', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/actions`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Get all refs from single snapshot
    const textRef = snap.text.match(/@e\d+(?= textbox "Text field")/)?.[0];
    const notesRef = snap.text.match(/@e\d+(?= textbox "Notes")/)?.[0];
    const dynamicRef = snap.text.match(/@e\d+(?= textbox "Dynamic field")/)?.[0];

    // Execute multiple actions without re-snapshotting
    const r1 = await sendToContentScript(browser, page, {
      action: 'typeText', ref: textRef, text: 'first',
    });
    const r2 = await sendToContentScript(browser, page, {
      action: 'typeText', ref: notesRef, text: 'second',
    });
    const r3 = await sendToContentScript(browser, page, {
      action: 'typeText', ref: dynamicRef, text: 'third',
    });

    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(r3.success).toBe(true);

    // Verify all values set correctly
    const values = await page.evaluate(() => ({
      text: (document.getElementById('text-input') as HTMLInputElement).value,
      notes: (document.getElementById('textarea') as HTMLTextAreaElement).value,
      dynamic: (document.getElementById('dynamic-input') as HTMLInputElement).value,
    }));
    expect(values.text).toBe('first');
    expect(values.notes).toBe('second');
    expect(values.dynamic).toBe('third');
  }, 30_000);
});
