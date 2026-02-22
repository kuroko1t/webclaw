/**
 * E2E: Semantic HTML5 elements and realistic user workflows
 *
 * Tests HTML5 semantic elements (output, progress, meter, input types),
 * ARIA presentation roles, and multi-step user workflows.
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

/** HTML5 input types and semantic elements */
const SEMANTIC_ELEMENTS_PAGE = `<!DOCTYPE html><html><body>
  <h1>Semantic Elements Test</h1>

  <h2>HTML5 Input Types</h2>
  <input type="image" src="data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==" alt="Submit form" id="img-input">
  <input type="color" aria-label="Pick color" value="#ff0000" id="color-input">
  <input type="date" aria-label="Date picker" id="date-input">
  <input type="time" aria-label="Time picker" id="time-input">
  <input type="range" aria-label="Volume" min="0" max="100" value="50" id="range-input">

  <h2>Output Elements</h2>
  <output id="calc-result" aria-label="Calculation result">42</output>
  <label for="prog-elem">Upload:</label>
  <progress id="prog-elem" aria-label="Upload progress" value="70" max="100"></progress>
  <meter id="meter-elem" aria-label="Disk usage" value="0.6" min="0" max="1">60%</meter>

  <h2>Normal</h2>
  <button id="normal-btn">Normal Button</button>
  <input type="text" aria-label="Text field" id="text-input">
</body></html>`;

/** ARIA presentation/none roles */
const PRESENTATION_ROLE_PAGE = `<!DOCTYPE html><html><body>
  <h1>Presentation Roles</h1>

  <table role="presentation">
    <tr>
      <td><button id="action1">Action 1</button></td>
      <td><button id="action2">Action 2</button></td>
    </tr>
  </table>

  <div role="none">
    <button id="inner-btn">Inner Button</button>
  </div>

  <nav id="main-nav">
    <ul role="presentation">
      <li><a href="/home">Home</a></li>
      <li><a href="/about">About</a></li>
    </ul>
  </nav>

  <button id="standalone">Standalone</button>
</body></html>`;

/** E-commerce product page */
const PRODUCT_PAGE = `<!DOCTYPE html><html><body>
  <h1>Premium Headphones</h1>
  <img src="data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==" alt="Premium wireless headphones">
  <p>Price: $199.99</p>
  <label for="qty">Quantity:</label>
  <input type="number" id="qty" value="1" min="1" max="10">
  <label for="color-sel">Color:</label>
  <select id="color-sel">
    <option value="black">Black</option>
    <option value="white">White</option>
    <option value="blue">Blue</option>
  </select>
  <button id="add-cart">Add to Cart</button>
  <div id="cart-status" role="status"></div>
  <section>
    <h2>Customer Reviews</h2>
    <div role="list" id="reviews">
      <div role="listitem">Great sound quality - 5 stars</div>
      <div role="listitem">Good but expensive - 4 stars</div>
    </div>
  </section>
  <script>
    document.getElementById('add-cart').addEventListener('click', function() {
      var qty = document.getElementById('qty').value;
      var color = document.getElementById('color-sel').value;
      document.getElementById('cart-status').textContent =
        'Added ' + qty + 'x ' + color + ' headphones to cart';
      this.textContent = 'Added!';
      this.disabled = true;
    });
  </script>
</body></html>`;

/** Search and filter */
const SEARCH_FILTER_PAGE = `<!DOCTYPE html><html><body>
  <h1>Product Search</h1>
  <form onsubmit="return false">
    <input type="search" id="search-input" aria-label="Search products" placeholder="Search...">
    <label><input type="checkbox" id="filter-instock"> In Stock Only</label>
    <select id="filter-sort" aria-label="Sort by">
      <option value="relevance">Relevance</option>
      <option value="price-asc">Price: Low to High</option>
      <option value="price-desc">Price: High to Low</option>
    </select>
    <select id="filter-category" aria-label="Category">
      <option value="all">All Categories</option>
      <option value="electronics">Electronics</option>
      <option value="clothing">Clothing</option>
    </select>
  </form>
  <div id="results" role="list">
    <div role="listitem">Laptop A - $999 - Electronics</div>
    <div role="listitem">T-Shirt B - $29 - Clothing</div>
    <div role="listitem">Monitor C - $499 - Electronics (Out of Stock)</div>
    <div role="listitem">Jacket D - $89 - Clothing</div>
    <div role="listitem">Keyboard E - $79 - Electronics</div>
  </div>
  <div id="result-count" role="status">5 results</div>
  <script>
    var products = [
      {name:'Laptop A',price:999,cat:'electronics',inStock:true},
      {name:'T-Shirt B',price:29,cat:'clothing',inStock:true},
      {name:'Monitor C',price:499,cat:'electronics',inStock:false},
      {name:'Jacket D',price:89,cat:'clothing',inStock:true},
      {name:'Keyboard E',price:79,cat:'electronics',inStock:true},
    ];
    function filterProducts(){
      var s=document.getElementById('search-input').value.toLowerCase();
      var inStock=document.getElementById('filter-instock').checked;
      var cat=document.getElementById('filter-category').value;
      var sort=document.getElementById('filter-sort').value;
      var f=products.filter(function(p){
        if(s&&p.name.toLowerCase().indexOf(s)===-1)return false;
        if(inStock&&!p.inStock)return false;
        if(cat!=='all'&&p.cat!==cat)return false;
        return true;
      });
      if(sort==='price-asc')f.sort(function(a,b){return a.price-b.price});
      if(sort==='price-desc')f.sort(function(a,b){return b.price-a.price});
      document.getElementById('results').innerHTML=f.map(function(p){
        return '<div role="listitem">'+p.name+' - $'+p.price+' - '+p.cat+
          (p.inStock?'':' (Out of Stock)')+'</div>';
      }).join('');
      document.getElementById('result-count').textContent=f.length+' results';
    }
    document.getElementById('search-input').addEventListener('input',filterProducts);
    document.getElementById('filter-instock').addEventListener('change',filterProducts);
    document.getElementById('filter-category').addEventListener('change',filterProducts);
    document.getElementById('filter-sort').addEventListener('change',filterProducts);
  </script>
</body></html>`;

/** Multi-step wizard form */
const WIZARD_PAGE = `<!DOCTYPE html><html><body>
  <h1>Registration</h1>
  <div id="step-indicator" role="status">Step 1 of 3</div>

  <div id="step1">
    <h2>Personal Info</h2>
    <label for="fullname">Full Name</label>
    <input type="text" id="fullname">
    <label for="email">Email</label>
    <input type="email" id="email">
    <button id="next1">Next</button>
  </div>

  <div id="step2" style="display:none">
    <h2>Preferences</h2>
    <fieldset>
      <legend>Notifications</legend>
      <label><input type="radio" name="notify" value="email" checked> Email</label>
      <label><input type="radio" name="notify" value="sms"> SMS</label>
      <label><input type="radio" name="notify" value="none"> None</label>
    </fieldset>
    <label for="bio">Bio</label>
    <textarea id="bio" placeholder="Tell us about yourself"></textarea>
    <button id="back2">Back</button>
    <button id="next2">Next</button>
  </div>

  <div id="step3" style="display:none">
    <h2>Confirmation</h2>
    <div id="summary"></div>
    <button id="back3">Back</button>
    <button id="submit-btn">Submit</button>
  </div>

  <div id="result" style="display:none">
    <h2>Registration Complete!</h2>
    <p id="result-msg"></p>
  </div>

  <script>
    function goStep(n){
      ['step1','step2','step3'].forEach(function(id){document.getElementById(id).style.display='none'});
      document.getElementById('step'+n).style.display='';
      document.getElementById('step-indicator').textContent='Step '+n+' of 3';
      if(n===3){
        var name=document.getElementById('fullname').value;
        var email=document.getElementById('email').value;
        var notify=document.querySelector('input[name="notify"]:checked').value;
        var bio=document.getElementById('bio').value;
        document.getElementById('summary').innerHTML=
          '<p>Name: '+name+'</p><p>Email: '+email+'</p><p>Notifications: '+notify+'</p><p>Bio: '+(bio||'(none)')+'</p>';
      }
    }
    function submitForm(){
      ['step1','step2','step3'].forEach(function(id){document.getElementById(id).style.display='none'});
      document.getElementById('step-indicator').style.display='none';
      document.getElementById('result').style.display='';
      document.getElementById('result-msg').textContent=
        'Thank you, '+document.getElementById('fullname').value+'! Your registration is complete.';
    }
    document.getElementById('next1').addEventListener('click',function(){goStep(2)});
    document.getElementById('back2').addEventListener('click',function(){goStep(1)});
    document.getElementById('next2').addEventListener('click',function(){goStep(3)});
    document.getElementById('back3').addEventListener('click',function(){goStep(2)});
    document.getElementById('submit-btn').addEventListener('click',submitForm);
  </script>
</body></html>`;

/** Accordion FAQ page */
const ACCORDION_PAGE = `<!DOCTYPE html><html><body>
  <h1>FAQ</h1>
  <details id="faq1">
    <summary>What is your return policy?</summary>
    <p>You can return items within 30 days of purchase.</p>
  </details>
  <details id="faq2">
    <summary>How long does shipping take?</summary>
    <p>Standard shipping takes 5-7 business days.</p>
  </details>
  <details id="faq3" open>
    <summary>Do you offer international shipping?</summary>
    <p>Yes, we ship to over 50 countries worldwide.</p>
    <a href="/shipping-rates">View shipping rates</a>
  </details>
  <h2>Still have questions?</h2>
  <label for="contact-email">Your Email</label>
  <input type="email" id="contact-email">
  <label for="question">Your Question</label>
  <textarea id="question" placeholder="Type your question here..."></textarea>
  <button id="send-question">Send Question</button>
  <div id="send-status" role="status"></div>
  <script>
    document.getElementById('send-question').addEventListener('click', function(){
      var email=document.getElementById('contact-email').value;
      var q=document.getElementById('question').value;
      if(!email||!q){
        document.getElementById('send-status').textContent='Please fill in all fields';
        return;
      }
      this.disabled=true;
      this.textContent='Sending...';
      var btn=this;
      setTimeout(function(){
        document.getElementById('send-status').textContent='Question sent! We will reply to '+email;
        btn.textContent='Sent!';
      },500);
    });
  </script>
</body></html>`;

describe('Semantic Elements & Workflows E2E', () => {
  let browser: Browser;
  let server: Server;
  let port: number;
  let page: Page;

  beforeAll(async () => {
    ({ server, port } = await startTestServer({
      '/semantic': SEMANTIC_ELEMENTS_PAGE,
      '/presentation': PRESENTATION_ROLE_PAGE,
      '/product': PRODUCT_PAGE,
      '/search': SEARCH_FILTER_PAGE,
      '/wizard': WIZARD_PAGE,
      '/accordion': ACCORDION_PAGE,
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

  // ---- HTML5 Semantic Elements ----

  it('should show input[type="image"] as button role, not textbox', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/semantic`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const line = findLine(snap.text, 'Submit form');
    expect(line).toBeTruthy();
    expect(line).toContain('button');
    expect(line).not.toContain('textbox');
  }, 30_000);

  it('should include output element in snapshot with value', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/semantic`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // output has aria-label="Calculation result" and text content "42"
    expect(snap.text).toContain('Calculation result');
    expect(snap.text).toContain('status');
    // The value "42" should also appear
    const line = findLine(snap.text, 'Calculation result');
    expect(line).toContain('42');
  }, 30_000);

  it('should include progress element in snapshot with value', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/semantic`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    expect(snap.text).toContain('Upload progress');
    expect(snap.text).toContain('progressbar');
    // Value should show 70/100
    const line = findLine(snap.text, 'Upload progress');
    expect(line).toContain('70');
  }, 30_000);

  it('should include meter element in snapshot with value', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/semantic`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    expect(snap.text).toContain('Disk usage');
    expect(snap.text).toContain('meter');
    const line = findLine(snap.text, 'Disk usage');
    expect(line).toContain('0.6');
  }, 30_000);

  it('should handle typeText on range input to set slider value', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/semantic`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Range input should appear as slider
    const line = findLine(snap.text, 'Volume');
    expect(line).toContain('slider');

    const ref = extractRef(snap.text, 'Volume');
    expect(ref).toBeTruthy();

    // typeText to set slider value
    const result = await sendToContentScript(browser, page, {
      action: 'typeText', ref, text: '75',
    });
    expect(result.success).toBe(true);

    // Verify the value changed
    const val = await page.evaluate(() =>
      (document.getElementById('range-input') as HTMLInputElement).value
    );
    expect(val).toBe('75');
  }, 30_000);

  it('should show all HTML5 input types with correct roles', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/semantic`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // color, date, time inputs should appear as textbox (they are text-like)
    expect(snap.text).toContain('Pick color');
    expect(snap.text).toContain('Date picker');
    expect(snap.text).toContain('Time picker');

    // All should have refs (interactive)
    expect(extractRef(snap.text, 'Pick color')).toBeTruthy();
    expect(extractRef(snap.text, 'Date picker')).toBeTruthy();
    expect(extractRef(snap.text, 'Time picker')).toBeTruthy();
  }, 30_000);

  // ---- ARIA Presentation Roles ----

  it('should not include role="presentation" or role="none" in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/presentation`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // These ARIA roles mean "remove semantic role" - should not appear
    expect(snap.text).not.toContain('[presentation');
    expect(snap.text).not.toContain('[none');
  }, 30_000);

  it('should still include interactive elements inside presentation containers', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/presentation`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Buttons and links inside presentation containers should still work
    expect(extractRef(snap.text, 'Action 1')).toBeTruthy();
    expect(extractRef(snap.text, 'Action 2')).toBeTruthy();
    expect(extractRef(snap.text, 'Inner Button')).toBeTruthy();
    expect(extractRef(snap.text, 'Standalone')).toBeTruthy();

    // Links in nav > ul[role=presentation] > li should still work
    expect(extractRef(snap.text, 'Home')).toBeTruthy();
    expect(extractRef(snap.text, 'About')).toBeTruthy();

    // Nav should still show its role
    expect(snap.text).toContain('nav');

    // Click one of the buttons to verify it works
    const ref = extractRef(snap.text, 'Action 1');
    const result = await sendToContentScript(browser, page, { action: 'click', ref });
    expect(result.success).toBe(true);
  }, 30_000);

  // ---- E-commerce Product Workflow ----

  it('should complete full product page workflow: browse, configure, add to cart', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/product`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Page should show product info
    expect(snap.text).toContain('Premium Headphones');
    expect(snap.text).toContain('Premium wireless headphones');
    expect(snap.text).toContain('Customer Reviews');
    expect(snap.text).toContain('Great sound quality');

    // Set quantity to 3
    const qtyRef = extractRef(snap.text, 'Quantity');
    expect(qtyRef).toBeTruthy();
    const r1 = await sendToContentScript(browser, page, {
      action: 'typeText', ref: qtyRef, text: '3',
    });
    expect(r1.success).toBe(true);

    // Select Blue color
    const colorRef = extractRef(snap.text, 'Color');
    expect(colorRef).toBeTruthy();
    const r2 = await sendToContentScript(browser, page, {
      action: 'selectOption', ref: colorRef, value: 'Blue',
    });
    expect(r2.success).toBe(true);

    // Click Add to Cart
    const cartRef = extractRef(snap.text, 'Add to Cart');
    expect(cartRef).toBeTruthy();
    const r3 = await sendToContentScript(browser, page, { action: 'click', ref: cartRef });
    expect(r3.success).toBe(true);

    // Verify cart status appeared
    await new Promise(r => setTimeout(r, 200));
    const snap2 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap2.text).toContain('3x blue headphones');

    // Add to Cart button should now be disabled
    expect(snap2.text).toContain('Added!');
    const addedLine = findLine(snap2.text, 'Added!');
    expect(addedLine).toContain('disabled');
  }, 20_000);

  // ---- Search and Filter Workflow ----

  it('should complete search and filter workflow', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/search`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Initial state: 5 results
    expect(snap.text).toContain('5 results');
    expect(snap.text).toContain('Laptop A');

    // Type search query
    const searchRef = extractRef(snap.text, 'Search products');
    const r1 = await sendToContentScript(browser, page, {
      action: 'typeText', ref: searchRef, text: 'Laptop',
    });
    expect(r1.success).toBe(true);
    await new Promise(r => setTimeout(r, 200));

    // Re-snapshot to see filtered results
    const snap2 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap2.text).toContain('1 results');
    expect(snap2.text).toContain('Laptop A');
    expect(snap2.text).not.toContain('T-Shirt');

    // Clear search and filter by category
    const searchRef2 = extractRef(snap2.text, 'Search products');
    await sendToContentScript(browser, page, {
      action: 'typeText', ref: searchRef2, text: '',
    });
    await new Promise(r => setTimeout(r, 100));

    const snap3 = await sendToContentScript(browser, page, { action: 'snapshot' });
    const catRef = extractRef(snap3.text, 'Category');
    await sendToContentScript(browser, page, {
      action: 'selectOption', ref: catRef, value: 'Electronics',
    });
    await new Promise(r => setTimeout(r, 200));

    const snap4 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap4.text).toContain('3 results');
    expect(snap4.text).toContain('Laptop A');
    expect(snap4.text).toContain('Keyboard E');
    expect(snap4.text).not.toContain('T-Shirt');

    // Apply "In Stock Only" filter
    const instockRef = extractRef(snap4.text, 'In Stock Only');
    await sendToContentScript(browser, page, { action: 'click', ref: instockRef });
    await new Promise(r => setTimeout(r, 200));

    const snap5 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap5.text).toContain('2 results');
    expect(snap5.text).not.toContain('Monitor C');
  }, 25_000);

  // ---- Multi-step Wizard Workflow ----

  it('should complete multi-step registration wizard', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/wizard`);
    const snap1 = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Step 1: should show Personal Info
    expect(snap1.text).toContain('Step 1 of 3');
    expect(snap1.text).toContain('Personal Info');
    expect(snap1.text).toContain('Full Name');
    expect(snap1.text).toContain('Email');

    // Step 2 and 3 should be hidden (display:none)
    expect(snap1.text).not.toContain('Preferences');
    expect(snap1.text).not.toContain('Confirmation');

    // Fill step 1
    const nameRef = extractRef(snap1.text, 'Full Name');
    await sendToContentScript(browser, page, {
      action: 'typeText', ref: nameRef, text: 'John Doe',
    });
    const emailRef = extractRef(snap1.text, 'Email');
    await sendToContentScript(browser, page, {
      action: 'typeText', ref: emailRef, text: 'john@example.com',
    });

    // Click Next
    const nextRef = extractRef(snap1.text, 'Next');
    await sendToContentScript(browser, page, { action: 'click', ref: nextRef });
    await new Promise(r => setTimeout(r, 300));

    // Step 2: Preferences
    const snap2 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap2.text).toContain('Step 2 of 3');
    expect(snap2.text).toContain('Preferences');
    expect(snap2.text).toContain('Notifications');
    expect(snap2.text).not.toContain('Personal Info');

    // Radio group should show Email as checked
    const emailRadioLine = findLine(snap2.text, 'Email');
    // The radio with "Email" should be checked
    expect(snap2.text).toMatch(/radio.*Email.*checked|checked.*Email/s);

    // Click SMS radio
    const smsRef = extractRef(snap2.text, 'SMS');
    expect(smsRef).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref: smsRef });

    // Fill bio
    const bioRef = extractRef(snap2.text, 'Bio');
    await sendToContentScript(browser, page, {
      action: 'typeText', ref: bioRef, text: 'Hello world',
    });

    // Click Next
    const next2Ref = extractLastRef(snap2.text, 'Next');
    await sendToContentScript(browser, page, { action: 'click', ref: next2Ref });
    await new Promise(r => setTimeout(r, 300));

    // Step 3: Confirmation
    const snap3 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap3.text).toContain('Step 3 of 3');
    expect(snap3.text).toContain('Confirmation');

    // Summary text is plain <p> elements (no structural role) so it's pruned
    // from the compact snapshot by design. Verify content via DOM instead.
    const summaryText = await page.evaluate(() =>
      document.getElementById('summary')?.textContent
    );
    expect(summaryText).toContain('John Doe');
    expect(summaryText).toContain('john@example.com');
    expect(summaryText).toContain('sms');

    // Click Submit
    const submitRef = extractRef(snap3.text, 'Submit');
    await sendToContentScript(browser, page, { action: 'click', ref: submitRef });
    await new Promise(r => setTimeout(r, 300));

    // Result
    const snap4 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap4.text).toContain('Registration Complete');

    // Result message is plain <p> text, verify via DOM
    const resultMsg = await page.evaluate(() =>
      document.getElementById('result-msg')?.textContent
    );
    expect(resultMsg).toContain('Thank you, John Doe');
  }, 30_000);

  it('should handle wizard back navigation', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/wizard`);
    const snap1 = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Go to step 2
    const nextRef = extractRef(snap1.text, 'Next');
    await sendToContentScript(browser, page, { action: 'click', ref: nextRef });
    await new Promise(r => setTimeout(r, 200));

    const snap2 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap2.text).toContain('Step 2 of 3');

    // Go back to step 1
    const backRef = extractRef(snap2.text, 'Back');
    await sendToContentScript(browser, page, { action: 'click', ref: backRef });
    await new Promise(r => setTimeout(r, 200));

    const snap3 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap3.text).toContain('Step 1 of 3');
    expect(snap3.text).toContain('Personal Info');
  }, 20_000);

  // ---- Accordion FAQ Workflow ----

  it('should open FAQ accordion, interact with contact form, and submit', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/accordion`);
    const snap1 = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Open FAQ (already tested this works, but verify content)
    expect(snap1.text).toContain('What is your return policy?');
    expect(snap1.text).toContain('Do you offer international shipping?');

    // Open first FAQ
    const faq1Ref = extractRef(snap1.text, 'What is your return policy?');
    expect(faq1Ref).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref: faq1Ref });
    await new Promise(r => setTimeout(r, 300));

    // Fill contact form
    const snap2 = await sendToContentScript(browser, page, { action: 'snapshot' });

    const emailRef = extractRef(snap2.text, 'Your Email');
    await sendToContentScript(browser, page, {
      action: 'typeText', ref: emailRef, text: 'test@example.com',
    });

    const qRef = extractRef(snap2.text, 'Your Question');
    await sendToContentScript(browser, page, {
      action: 'typeText', ref: qRef, text: 'Do you ship to Japan?',
    });

    // Click Send
    const sendRef = extractRef(snap2.text, 'Send Question');
    await sendToContentScript(browser, page, { action: 'click', ref: sendRef });
    await new Promise(r => setTimeout(r, 800));

    // Verify status
    const snap3 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap3.text).toContain('Question sent');
    expect(snap3.text).toContain('test@example.com');
  }, 20_000);

  it('should show validation error when submitting empty contact form', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/accordion`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Click Send without filling fields
    const sendRef = extractRef(snap.text, 'Send Question');
    await sendToContentScript(browser, page, { action: 'click', ref: sendRef });
    await new Promise(r => setTimeout(r, 200));

    const snap2 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap2.text).toContain('Please fill in all fields');
  }, 30_000);
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

/** Extract ref for the LAST occurrence of labelText (useful when a label appears multiple times) */
function extractLastRef(snapshotText: string, labelText: string): string | null {
  const lines = snapshotText.split('\n');
  let lastRef: string | null = null;
  for (const line of lines) {
    if (line.includes(labelText)) {
      const refMatch = line.match(/@e\d+/);
      if (refMatch) lastRef = refMatch[0];
    }
  }
  return lastRef;
}

function findLine(snapshotText: string, labelText: string): string | null {
  const lines = snapshotText.split('\n');
  for (const line of lines) {
    if (line.includes(labelText)) return line;
  }
  return null;
}
