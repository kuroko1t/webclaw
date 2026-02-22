/**
 * E2E: Advanced scenarios and edge cases
 *
 * Tests for less common but important real-world scenarios:
 * - ARIA landmark navigation
 * - Multiple forms on one page
 * - Nested interactive elements
 * - Elements that change after interaction
 * - Rapid DOM mutations
 * - Long content truncation
 * - Role-based text extraction
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

/** ARIA landmark-rich page (typical SPA layout) */
const LANDMARK_PAGE = `<!DOCTYPE html><html><body>
  <header>
    <nav aria-label="Main navigation">
      <a href="/home">Home</a>
      <a href="/about">About</a>
      <a href="/contact">Contact</a>
    </nav>
  </header>
  <main>
    <h1>Welcome</h1>
    <section aria-label="Search section">
      <input type="search" aria-label="Search" placeholder="Search...">
      <button type="button">Go</button>
    </section>
    <article>
      <h2>Article Title</h2>
      <p>Article content here.</p>
    </article>
  </main>
  <aside aria-label="Sidebar">
    <h3>Related Links</h3>
    <a href="/link1">Link 1</a>
    <a href="/link2">Link 2</a>
  </aside>
  <footer>
    <p>Footer content</p>
    <a href="/privacy">Privacy</a>
  </footer>
</body></html>`;

/** Page with multiple forms (search + settings + contact) */
const MULTI_FORM_PAGE = `<!DOCTYPE html><html><body>
  <h1>Multi-Form Page</h1>
  <form id="search-form" aria-label="Search form">
    <input type="search" name="q" aria-label="Search query">
    <button type="submit">Search</button>
  </form>
  <form id="settings-form" aria-label="Settings form">
    <label for="theme">Theme</label>
    <select id="theme" name="theme" aria-label="Theme">
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
    <label for="lang">Language</label>
    <select id="lang" name="lang" aria-label="Language">
      <option value="en">English</option>
      <option value="ja">Japanese</option>
    </select>
    <button type="submit">Save Settings</button>
  </form>
  <form id="contact-form" aria-label="Contact form">
    <input type="text" name="name" aria-label="Your name">
    <input type="email" name="email" aria-label="Your email">
    <textarea name="message" aria-label="Your message"></textarea>
    <button type="submit">Send</button>
  </form>
  <div id="result"></div>
  <script>
    document.querySelectorAll('form').forEach(form => {
      form.addEventListener('submit', e => {
        e.preventDefault();
        const data = new FormData(form);
        const entries = [...data.entries()].map(([k,v]) => k + '=' + v).join('&');
        document.getElementById('result').textContent = form.id + ': ' + entries;
      });
    });
  </script>
</body></html>`;

/** Elements that change state after interaction (toggles, counters) */
const STATEFUL_PAGE = `<!DOCTYPE html><html><body>
  <h1>Stateful Elements</h1>
  <div>
    <button id="counter-btn">Count: 0</button>
    <button id="toggle-btn" aria-pressed="false">Feature: OFF</button>
  </div>
  <div id="status" role="status">Ready</div>
  <div>
    <button id="async-btn" aria-label="Start process">Start</button>
    <div id="progress" role="progressbar" aria-valuenow="0" aria-valuemax="100">0%</div>
  </div>
  <script>
    let count = 0;
    document.getElementById('counter-btn').addEventListener('click', () => {
      count++;
      document.getElementById('counter-btn').textContent = 'Count: ' + count;
    });
    let on = false;
    document.getElementById('toggle-btn').addEventListener('click', () => {
      on = !on;
      const btn = document.getElementById('toggle-btn');
      btn.textContent = 'Feature: ' + (on ? 'ON' : 'OFF');
      btn.setAttribute('aria-pressed', String(on));
    });
    document.getElementById('async-btn').addEventListener('click', () => {
      document.getElementById('status').textContent = 'Processing...';
      document.getElementById('async-btn').disabled = true;
      setTimeout(() => {
        document.getElementById('status').textContent = 'Done!';
        document.getElementById('async-btn').disabled = false;
        document.getElementById('progress').textContent = '100%';
        document.getElementById('progress').setAttribute('aria-valuenow', '100');
      }, 500);
    });
  </script>
</body></html>`;

/** Nested interactive elements (buttons inside links, etc.) */
const NESTED_INTERACTIVE_PAGE = `<!DOCTYPE html><html><body>
  <h1>Nested Interactive</h1>
  <div id="card1" role="button" tabindex="0" aria-label="Card action" onclick="document.getElementById('card-output').textContent='Card clicked'">
    <h3>Card Title</h3>
    <p>Card description</p>
    <button id="card-btn" onclick="event.stopPropagation();document.getElementById('card-output').textContent='Button clicked'">Details</button>
  </div>
  <div id="card-output"></div>
  <ul role="listbox" aria-label="Options list">
    <li role="option" id="opt1">Option A</li>
    <li role="option" id="opt2">Option B</li>
    <li role="option" id="opt3">Option C</li>
  </ul>
</body></html>`;

/** Rapid DOM mutations (real-time feed) */
const MUTATION_PAGE = `<!DOCTYPE html><html><body>
  <h1>Real-time Feed</h1>
  <button id="start-feed">Start Feed</button>
  <button id="stop-feed">Stop Feed</button>
  <ul id="feed" role="list" aria-label="Messages"></ul>
  <script>
    let interval;
    let msgCount = 0;
    document.getElementById('start-feed').addEventListener('click', () => {
      interval = setInterval(() => {
        msgCount++;
        const li = document.createElement('li');
        li.setAttribute('role', 'listitem');
        const btn = document.createElement('button');
        btn.textContent = 'Message ' + msgCount;
        btn.id = 'msg-btn-' + msgCount;
        li.appendChild(btn);
        const feed = document.getElementById('feed');
        feed.insertBefore(li, feed.firstChild);
        if (feed.children.length > 10) feed.lastChild.remove();
      }, 200);
    });
    document.getElementById('stop-feed').addEventListener('click', () => {
      clearInterval(interval);
    });
  </script>
</body></html>`;

/** ARIA live regions and status messages */
const LIVE_REGION_PAGE = `<!DOCTYPE html><html><body>
  <h1>Live Regions</h1>
  <div role="alert" id="alert-box" style="display:none">Alert message</div>
  <div role="status" id="status-box">Idle</div>
  <div role="log" id="log-box">Log started</div>
  <div role="tooltip" id="tooltip" style="display:none">Helpful tip</div>
  <button id="trigger-alert" onclick="document.getElementById('alert-box').style.display='block';document.getElementById('alert-box').textContent='Error occurred!'">Trigger Alert</button>
  <button id="update-status" onclick="document.getElementById('status-box').textContent='Loading...'">Update Status</button>
  <button id="add-log" onclick="document.getElementById('log-box').textContent=document.getElementById('log-box').textContent+' | New entry'">Add Log</button>
</body></html>`;

/** Cookie consent / overlay blocking pattern */
const OVERLAY_PAGE = `<!DOCTYPE html><html><body>
  <h1>Main Content</h1>
  <input type="text" aria-label="Main input" id="main-input">
  <div id="overlay" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center">
    <div style="background:white;padding:20px;border-radius:8px">
      <h2>Cookie Consent</h2>
      <p>We use cookies for analytics.</p>
      <button id="accept-cookies" onclick="document.getElementById('overlay').remove()">Accept All</button>
      <button id="reject-cookies" onclick="document.getElementById('overlay').remove()">Reject</button>
    </div>
  </div>
</body></html>`;

describe('Advanced Scenarios E2E', () => {
  let browser: Browser;
  let server: Server;
  let port: number;
  let page: Page;

  beforeAll(async () => {
    ({ server, port } = await startTestServer({
      '/landmarks': LANDMARK_PAGE,
      '/multi-form': MULTI_FORM_PAGE,
      '/stateful': STATEFUL_PAGE,
      '/nested': NESTED_INTERACTIVE_PAGE,
      '/mutation': MUTATION_PAGE,
      '/live-region': LIVE_REGION_PAGE,
      '/overlay': OVERLAY_PAGE,
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

  // ---- ARIA Landmarks ----

  it('should include ARIA landmarks (nav, main, aside, footer) in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/landmarks`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    expect(snap.text).toContain('[nav');
    expect(snap.text).toContain('[main]');
    expect(snap.text).toContain('[complementary');
    expect(snap.text).toContain('[contentinfo]');
    expect(snap.text).toContain('Main navigation');
    expect(snap.text).toContain('Sidebar');
  }, 30_000);

  it('should include all links in nav correctly', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/landmarks`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    expect(snap.text).toContain('Home');
    expect(snap.text).toContain('About');
    expect(snap.text).toContain('Contact');

    // All links should have refs
    const homeRef = extractRef(snap.text, 'Home');
    const aboutRef = extractRef(snap.text, 'About');
    const contactRef = extractRef(snap.text, 'Contact');
    expect(homeRef).toBeTruthy();
    expect(aboutRef).toBeTruthy();
    expect(contactRef).toBeTruthy();
    // All should be different refs
    expect(new Set([homeRef, aboutRef, contactRef]).size).toBe(3);
  }, 30_000);

  // ---- Multiple forms ----

  it('should interact with one form without affecting others', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/multi-form`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Fill contact form
    const nameRef = extractRef(snap.text, 'Your name');
    const emailRef = extractRef(snap.text, 'Your email');
    const msgRef = extractRef(snap.text, 'Your message');
    const sendRef = extractRef(snap.text, 'Send');

    expect(nameRef).toBeTruthy();
    expect(emailRef).toBeTruthy();
    expect(msgRef).toBeTruthy();
    expect(sendRef).toBeTruthy();

    await sendToContentScript(browser, page, { action: 'typeText', ref: nameRef, text: 'John' });
    await sendToContentScript(browser, page, { action: 'typeText', ref: emailRef, text: 'john@test.com' });
    await sendToContentScript(browser, page, { action: 'typeText', ref: msgRef, text: 'Hello!' });
    await sendToContentScript(browser, page, { action: 'click', ref: sendRef });

    await new Promise(r => setTimeout(r, 300));

    const result = await page.evaluate(() => document.getElementById('result')?.textContent);
    expect(result).toContain('contact-form');
    expect(result).toContain('name=John');
    expect(result).toContain('email=john@test.com');
  }, 20_000);

  it('should change settings via select dropdowns and submit', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/multi-form`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const themeRef = extractRef(snap.text, 'Theme');
    const langRef = extractRef(snap.text, 'Language');
    const saveRef = extractRef(snap.text, 'Save Settings');

    expect(themeRef).toBeTruthy();
    expect(langRef).toBeTruthy();
    expect(saveRef).toBeTruthy();

    await sendToContentScript(browser, page, { action: 'selectOption', ref: themeRef, value: 'dark' });
    await sendToContentScript(browser, page, { action: 'selectOption', ref: langRef, value: 'Japanese' });
    await sendToContentScript(browser, page, { action: 'click', ref: saveRef });

    await new Promise(r => setTimeout(r, 300));

    const result = await page.evaluate(() => document.getElementById('result')?.textContent);
    expect(result).toContain('settings-form');
    expect(result).toContain('theme=dark');
    expect(result).toContain('lang=ja');
  }, 20_000);

  // ---- Stateful elements ----

  it('should update counter on repeated clicks', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/stateful`);

    for (let i = 1; i <= 3; i++) {
      const snap = await sendToContentScript(browser, page, { action: 'snapshot' });
      const ref = extractRef(snap.text, 'Count:');
      expect(ref).toBeTruthy();
      await sendToContentScript(browser, page, { action: 'click', ref });
    }

    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toContain('Count: 3');
  }, 20_000);

  it('should toggle feature on/off and reflect in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/stateful`);

    const snap1 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap1.text).toContain('Feature: OFF');

    const ref = extractRef(snap1.text, 'Feature:');
    expect(ref).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref });

    const snap2 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap2.text).toContain('Feature: ON');

    // Toggle back
    const ref2 = extractRef(snap2.text, 'Feature:');
    await sendToContentScript(browser, page, { action: 'click', ref: ref2 });

    const snap3 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap3.text).toContain('Feature: OFF');
  }, 20_000);

  it('should handle async process: button disables, status updates, then re-enables', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/stateful`);

    const snap1 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap1.text).toContain('Ready');

    const ref = extractRef(snap1.text, 'Start process');
    expect(ref).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref });

    // Check intermediate state (button disabled, status updated)
    const snap2 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap2.text).toContain('Processing...');
    const startLine = findLine(snap2.text, 'Start process');
    expect(startLine).toContain('(disabled)');

    // Wait for async process to complete
    await new Promise(r => setTimeout(r, 800));

    const snap3 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap3.text).toContain('Done!');
    expect(snap3.text).toContain('100%');
    const startLine3 = findLine(snap3.text, 'Start process');
    expect(startLine3).not.toContain('(disabled)');
  }, 20_000);

  // ---- ARIA live regions ----

  it('should show role="status" text in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/live-region`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    expect(snap.text).toContain('Idle');

    const ref = extractRef(snap.text, 'Update Status');
    await sendToContentScript(browser, page, { action: 'click', ref });

    const snap2 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap2.text).toContain('Loading...');
  }, 30_000);

  it('should show triggered alert text in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/live-region`);

    // Alert should be hidden initially
    const snap1 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap1.text).not.toContain('Alert message');

    // Trigger alert
    const ref = extractRef(snap1.text, 'Trigger Alert');
    await sendToContentScript(browser, page, { action: 'click', ref });
    await new Promise(r => setTimeout(r, 200));

    const snap2 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap2.text).toContain('Error occurred!');
  }, 30_000);

  it('should show updated log text in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/live-region`);
    const snap1 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap1.text).toContain('Log started');

    const ref = extractRef(snap1.text, 'Add Log');
    await sendToContentScript(browser, page, { action: 'click', ref });

    const snap2 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap2.text).toContain('New entry');
  }, 30_000);

  // ---- Rapid DOM mutations ----

  it('should take consistent snapshot during rapid DOM changes', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/mutation`);
    const snap1 = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Start the feed
    const startRef = extractRef(snap1.text, 'Start Feed');
    await sendToContentScript(browser, page, { action: 'click', ref: startRef });

    // Wait for some messages
    await new Promise(r => setTimeout(r, 1000));

    // Take snapshot while feed is running - should not crash
    const snap2 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap2.text).toContain('Message');
    expect(snap2.snapshotId).toMatch(/^snap-/);

    // Stop the feed
    const stopRef = extractRef(snap2.text, 'Stop Feed');
    await sendToContentScript(browser, page, { action: 'click', ref: stopRef });
  }, 20_000);

  // ---- Cookie consent overlay ----

  it('should see and dismiss a cookie consent overlay', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/overlay`);
    const snap1 = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Should see the cookie consent
    expect(snap1.text).toContain('Cookie Consent');
    expect(snap1.text).toContain('Accept All');

    // Accept cookies
    const acceptRef = extractRef(snap1.text, 'Accept All');
    expect(acceptRef).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref: acceptRef });

    await new Promise(r => setTimeout(r, 300));

    // After dismissal, overlay should be gone
    const snap2 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap2.text).not.toContain('Cookie Consent');
    expect(snap2.text).toContain('Main Content');

    // Main input should now be interactable
    const inputRef = extractRef(snap2.text, 'Main input');
    expect(inputRef).toBeTruthy();
    const result = await sendToContentScript(browser, page, {
      action: 'typeText', ref: inputRef, text: 'after cookies',
    });
    expect(result.success).toBe(true);
  }, 20_000);

  // ---- Nested interactive ----

  it('should handle nested role="button" with child button separately', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/nested`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Card action (role="button") should have a ref
    const cardRef = extractRef(snap.text, 'Card action');
    expect(cardRef).toBeTruthy();

    // Details button should also have its own ref
    const detailsRef = extractRef(snap.text, 'Details');
    expect(detailsRef).toBeTruthy();

    // They should be different refs
    expect(cardRef).not.toBe(detailsRef);

    // Click the inner button
    await sendToContentScript(browser, page, { action: 'click', ref: detailsRef });
    const output = await page.evaluate(() => document.getElementById('card-output')?.textContent);
    expect(output).toBe('Button clicked');
  }, 30_000);

  it('should include role="option" elements in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/nested`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    expect(snap.text).toContain('Options list');
    expect(snap.text).toContain('Option A');
    expect(snap.text).toContain('Option B');
    expect(snap.text).toContain('Option C');
  }, 30_000);

  // ---- Interaction after page reload within same tab ----

  it('should work correctly after navigating between pages', async () => {
    // Start on landmarks page
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/landmarks`);
    const snap1 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap1.text).toContain('Welcome');

    // Navigate to multi-form page
    await page.goto(`http://127.0.0.1:${port}/multi-form`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1500));

    const snap2 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap2.text).toContain('Multi-Form Page');

    // Should be able to interact
    const searchRef = extractRef(snap2.text, 'Search query');
    expect(searchRef).toBeTruthy();
    const result = await sendToContentScript(browser, page, {
      action: 'typeText', ref: searchRef, text: 'test query',
    });
    expect(result.success).toBe(true);
  }, 20_000);
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
