/**
 * E2E: Edge cases and potential bug verification
 *
 * Each test targets a specific suspected issue found by code review.
 * Tests are written to FAIL when a bug exists, then the code is fixed.
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

/** input type="hidden" should not appear in snapshot */
const HIDDEN_INPUT_PAGE = `<!DOCTYPE html><html><body>
  <h1>Hidden Input Test</h1>
  <form>
    <input type="hidden" name="csrf" value="abc123">
    <input type="hidden" name="session" value="xyz789">
    <input type="text" aria-label="Visible input">
    <button type="submit">Submit</button>
  </form>
</body></html>`;

/** selectOption / typeText on disabled elements */
const DISABLED_ACTIONS_PAGE = `<!DOCTYPE html><html><body>
  <h1>Disabled Actions</h1>
  <select id="sel1" disabled aria-label="Disabled select">
    <option value="a">Alpha</option>
    <option value="b">Beta</option>
  </select>
  <input id="inp1" type="text" disabled aria-label="Disabled text input" value="frozen">
  <textarea id="ta1" disabled aria-label="Disabled textarea">locked text</textarea>
  <select id="sel2" aria-label="Enabled select">
    <option value="x">X</option>
    <option value="y">Y</option>
  </select>
  <input id="inp2" type="text" aria-label="Enabled text input">
</body></html>`;

/** aria-disabled="true" elements */
const ARIA_DISABLED_PAGE = `<!DOCTYPE html><html><body>
  <h1>ARIA Disabled</h1>
  <button id="btn1" aria-disabled="true">Aria Disabled Button</button>
  <div role="button" id="div-btn" aria-disabled="true" tabindex="0">Disabled Div Button</div>
  <button id="btn2">Normal Button</button>
  <div id="output"></div>
  <script>
    document.getElementById('btn1').addEventListener('click', () => {
      document.getElementById('output').textContent = 'btn1 clicked';
    });
    document.getElementById('div-btn').addEventListener('click', () => {
      document.getElementById('output').textContent = 'div-btn clicked';
    });
    document.getElementById('btn2').addEventListener('click', () => {
      document.getElementById('output').textContent = 'btn2 clicked';
    });
  </script>
</body></html>`;

/** details/summary collapsible */
const DETAILS_PAGE = `<!DOCTYPE html><html><body>
  <h1>Details/Summary</h1>
  <details id="det1">
    <summary>Show Details</summary>
    <p>Hidden content inside details</p>
    <input type="text" aria-label="Details input">
    <button id="det-btn">Details Button</button>
  </details>
  <details id="det2" open>
    <summary>Open Details</summary>
    <p>Visible content inside open details</p>
    <button id="open-det-btn">Open Details Button</button>
  </details>
</body></html>`;

/** anchor tags: with href, without href, javascript:void(0) */
const LINKS_PAGE = `<!DOCTYPE html><html><body>
  <h1>Links Test</h1>
  <a href="/page1" id="link1">Normal Link</a>
  <a id="link2">No Href Link</a>
  <a href="#" id="link3">Hash Link</a>
  <a href="javascript:void(0)" id="link4" onclick="document.getElementById('link-output').textContent='js link clicked'">JS Link</a>
  <div id="link-output"></div>
</body></html>`;

/** visibility:hidden, opacity:0, height:0 visibility edge cases */
const VISIBILITY_PAGE = `<!DOCTYPE html><html><body>
  <h1>Visibility Edge Cases</h1>
  <button id="vis-hidden" style="visibility:hidden">Visibility Hidden</button>
  <button id="opacity-0" style="opacity:0">Opacity Zero</button>
  <div style="visibility:hidden">
    <button id="child-vis" style="visibility:visible">Child Visible</button>
  </div>
  <button id="normal-btn">Normal Visible</button>
  <div style="overflow:hidden;height:0">
    <button id="overflow-btn">Overflow Hidden</button>
  </div>
</body></html>`;

/** input type="file" */
const FILE_INPUT_PAGE = `<!DOCTYPE html><html><body>
  <h1>File Input</h1>
  <input type="file" id="file1" aria-label="Upload file">
  <input type="text" aria-label="Text field">
</body></html>`;

/** Complex label association */
const LABEL_PAGE = `<!DOCTYPE html><html><body>
  <h1>Label Associations</h1>
  <label for="lbl-input1">First Name</label>
  <input id="lbl-input1" type="text">

  <label>
    Last Name
    <input id="lbl-input2" type="text">
  </label>

  <span id="label-span">Email Address</span>
  <input id="lbl-input3" type="email" aria-labelledby="label-span">

  <label for="lbl-input4">
    <span>Phone</span> <em>Number</em>
  </label>
  <input id="lbl-input4" type="tel">
</body></html>`;

/** Pre-selected option, empty select, large option lists */
const SELECT_EDGE_PAGE = `<!DOCTYPE html><html><body>
  <h1>Select Edge Cases</h1>
  <select id="presel" aria-label="Preselected">
    <option value="a">First</option>
    <option value="b" selected>Second</option>
    <option value="c">Third</option>
  </select>
  <select id="empty-sel" aria-label="Empty select"></select>
  <select id="large-sel" aria-label="Large select">
    ${Array.from({length: 50}, (_, i) => `<option value="v${i}">Option ${i}</option>`).join('')}
  </select>
</body></html>`;

/** History API / SPA navigation */
const SPA_PAGE = `<!DOCTYPE html><html><body>
  <h1 id="page-title">Home</h1>
  <nav>
    <button id="nav-about" onclick="navigateTo('about')">About</button>
    <button id="nav-contact" onclick="navigateTo('contact')">Contact</button>
    <button id="nav-home" onclick="navigateTo('home')">Home</button>
  </nav>
  <div id="content">
    <p>Welcome to the home page</p>
    <input type="text" aria-label="Home input" id="home-input">
  </div>
  <script>
    function navigateTo(page) {
      history.pushState({page}, '', '/' + page);
      document.getElementById('page-title').textContent = page.charAt(0).toUpperCase() + page.slice(1);
      if (page === 'about') {
        document.getElementById('content').innerHTML = '<p>About us</p><button id="about-btn">Learn More</button>';
      } else if (page === 'contact') {
        document.getElementById('content').innerHTML = '<form><input type="email" aria-label="Contact email"><button type="submit">Send</button></form>';
      } else {
        document.getElementById('content').innerHTML = '<p>Welcome to the home page</p><input type="text" aria-label="Home input" id="home-input">';
      }
    }
  </script>
</body></html>`;

describe('Edge Cases E2E', () => {
  let browser: Browser;
  let server: Server;
  let port: number;
  let page: Page;

  beforeAll(async () => {
    ({ server, port } = await startTestServer({
      '/hidden-input': HIDDEN_INPUT_PAGE,
      '/disabled-actions': DISABLED_ACTIONS_PAGE,
      '/aria-disabled': ARIA_DISABLED_PAGE,
      '/details': DETAILS_PAGE,
      '/links': LINKS_PAGE,
      '/visibility': VISIBILITY_PAGE,
      '/file-input': FILE_INPUT_PAGE,
      '/labels': LABEL_PAGE,
      '/select-edge': SELECT_EDGE_PAGE,
      '/spa': SPA_PAGE,
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

  // ---- input type="hidden" ----

  it('should NOT include input type="hidden" in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/hidden-input`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Hidden inputs should not appear at all
    expect(snap.text).not.toContain('csrf');
    expect(snap.text).not.toContain('abc123');
    expect(snap.text).not.toContain('session');
    // Visible input should appear
    expect(snap.text).toContain('Visible input');
    expect(snap.text).toContain('Submit');
  }, 30_000);

  // ---- selectOption / typeText on disabled elements ----

  it('should fail selectOption on a disabled select', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/disabled-actions`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = extractRef(snap.text, 'Disabled select');
    expect(ref).toBeTruthy();

    const result = await sendToContentScript(browser, page, {
      action: 'selectOption', ref, value: 'Beta',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('disabled');
  }, 30_000);

  it('should fail typeText on a disabled input', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/disabled-actions`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = extractRef(snap.text, 'Disabled text input');
    expect(ref).toBeTruthy();

    const result = await sendToContentScript(browser, page, {
      action: 'typeText', ref, text: 'should fail',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('disabled');
  }, 30_000);

  it('should fail typeText on a disabled textarea', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/disabled-actions`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = extractRef(snap.text, 'Disabled textarea');
    expect(ref).toBeTruthy();

    const result = await sendToContentScript(browser, page, {
      action: 'typeText', ref, text: 'should fail',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('disabled');
  }, 30_000);

  it('should succeed on enabled select/input alongside disabled ones', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/disabled-actions`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const selRef = extractRef(snap.text, 'Enabled select');
    const result1 = await sendToContentScript(browser, page, {
      action: 'selectOption', ref: selRef, value: 'Y',
    });
    expect(result1.success).toBe(true);

    const inpRef = extractRef(snap.text, 'Enabled text input');
    const result2 = await sendToContentScript(browser, page, {
      action: 'typeText', ref: inpRef, text: 'works',
    });
    expect(result2.success).toBe(true);
  }, 30_000);

  // ---- aria-disabled ----

  it('should show aria-disabled="true" in snapshot as disabled', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/aria-disabled`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Check that aria-disabled buttons are visible in snapshot
    expect(snap.text).toContain('Aria Disabled Button');
    expect(snap.text).toContain('Disabled Div Button');
    expect(snap.text).toContain('Normal Button');
  }, 30_000);

  it('should fail click on aria-disabled="true" button', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/aria-disabled`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = extractRef(snap.text, 'Aria Disabled Button');
    expect(ref).toBeTruthy();

    const result = await sendToContentScript(browser, page, {
      action: 'click', ref,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('disabled');
  }, 30_000);

  it('should fail click on aria-disabled="true" div[role=button]', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/aria-disabled`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = extractRef(snap.text, 'Disabled Div Button');
    expect(ref).toBeTruthy();

    const result = await sendToContentScript(browser, page, {
      action: 'click', ref,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('disabled');
  }, 30_000);

  it('should succeed click on normal button (not aria-disabled)', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/aria-disabled`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = extractRef(snap.text, 'Normal Button');
    const result = await sendToContentScript(browser, page, { action: 'click', ref });
    expect(result.success).toBe(true);

    const output = await page.evaluate(() => document.getElementById('output')?.textContent);
    expect(output).toBe('btn2 clicked');
  }, 30_000);

  // ---- details/summary ----

  it('should show summary as button and closed details content as hidden', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/details`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Summary should appear as button
    expect(snap.text).toContain('Show Details');
    expect(snap.text).toContain('Open Details');

    // Open details content should be visible
    expect(snap.text).toContain('Open Details Button');
  }, 30_000);

  it('should show details content after opening via summary click', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/details`);
    const snap1 = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Click to open the closed details
    const summaryRef = extractRef(snap1.text, 'Show Details');
    expect(summaryRef).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref: summaryRef });
    await new Promise(r => setTimeout(r, 300));

    // Now the details content should be visible
    const snap2 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap2.text).toContain('Details Button');
    expect(snap2.text).toContain('Details input');
  }, 30_000);

  // ---- links ----

  it('should only assign refs to anchor tags with href', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/links`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Link with href should have ref
    const normalRef = extractRef(snap.text, 'Normal Link');
    expect(normalRef).toBeTruthy();

    // Hash and JS links should also have refs (they have href)
    const hashRef = extractRef(snap.text, 'Hash Link');
    expect(hashRef).toBeTruthy();

    const jsRef = extractRef(snap.text, 'JS Link');
    expect(jsRef).toBeTruthy();

    // Link without href should NOT have ref (not interactive)
    const noHrefRef = extractRef(snap.text, 'No Href Link');
    expect(noHrefRef).toBeNull();
  }, 30_000);

  it('should click javascript:void(0) link successfully', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/links`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = extractRef(snap.text, 'JS Link');
    const result = await sendToContentScript(browser, page, { action: 'click', ref });
    expect(result.success).toBe(true);

    const output = await page.evaluate(() => document.getElementById('link-output')?.textContent);
    expect(output).toBe('js link clicked');
  }, 30_000);

  // ---- visibility edge cases ----

  it('should exclude visibility:hidden and opacity:0 elements', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/visibility`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    expect(snap.text).not.toContain('Visibility Hidden');
    expect(snap.text).not.toContain('Opacity Zero');
    expect(snap.text).toContain('Normal Visible');
  }, 30_000);

  it('should include child with visibility:visible inside hidden parent', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/visibility`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // A child with visibility:visible inside a visibility:hidden parent IS visible
    expect(snap.text).toContain('Child Visible');
  }, 30_000);

  // ---- file input ----

  it('should include file input in snapshot but not allow typeText', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/file-input`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // File input should appear in snapshot
    expect(snap.text).toContain('Upload file');
    const fileRef = extractRef(snap.text, 'Upload file');
    expect(fileRef).toBeTruthy();
  }, 30_000);

  // ---- label associations ----

  it('should resolve label[for] association', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/labels`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    expect(snap.text).toContain('First Name');
    const ref = extractRef(snap.text, 'First Name');
    expect(ref).toBeTruthy();
  }, 30_000);

  it('should resolve wrapping label association', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/labels`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    expect(snap.text).toContain('Last Name');
  }, 30_000);

  it('should resolve aria-labelledby association', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/labels`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    expect(snap.text).toContain('Email Address');
  }, 30_000);

  it('should resolve multi-element label text', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/labels`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // label contains <span>Phone</span> <em>Number</em>
    expect(snap.text).toContain('Phone');
    expect(snap.text).toContain('Number');
  }, 30_000);

  // ---- select edge cases ----

  it('should show pre-selected option value in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/select-edge`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // "Second" is pre-selected
    const line = findLine(snap.text, 'Preselected');
    expect(line).toContain('Second');
  }, 30_000);

  it('should handle empty select gracefully', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/select-edge`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = extractRef(snap.text, 'Empty select');
    expect(ref).toBeTruthy();

    // selectOption on empty select should fail gracefully
    const result = await sendToContentScript(browser, page, {
      action: 'selectOption', ref, value: 'anything',
    });
    expect(result.success).toBe(false);
  }, 30_000);

  it('should handle large option list selectOption', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/select-edge`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = extractRef(snap.text, 'Large select');
    expect(ref).toBeTruthy();

    // Select by text
    const result = await sendToContentScript(browser, page, {
      action: 'selectOption', ref, value: 'Option 42',
    });
    expect(result.success).toBe(true);

    const val = await page.evaluate(() => (document.getElementById('large-sel') as HTMLSelectElement).value);
    expect(val).toBe('v42');
  }, 30_000);

  // ---- SPA navigation with history API ----

  it('should handle SPA navigation and re-snapshot correctly', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/spa`);
    const snap1 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap1.text).toContain('Home');
    expect(snap1.text).toContain('Home input');

    // Navigate to about page
    const aboutRef = extractRef(snap1.text, 'About');
    await sendToContentScript(browser, page, { action: 'click', ref: aboutRef });
    await new Promise(r => setTimeout(r, 300));

    const snap2 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap2.text).toContain('About');
    expect(snap2.text).toContain('Learn More');
    // Home input should be gone
    expect(snap2.text).not.toContain('Home input');

    // Navigate to contact page
    const contactRef = extractRef(snap2.text, 'Contact');
    await sendToContentScript(browser, page, { action: 'click', ref: contactRef });
    await new Promise(r => setTimeout(r, 300));

    const snap3 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap3.text).toContain('Contact');
    expect(snap3.text).toContain('Contact email');

    // Should be able to interact with new form
    const emailRef = extractRef(snap3.text, 'Contact email');
    expect(emailRef).toBeTruthy();
    const result = await sendToContentScript(browser, page, {
      action: 'typeText', ref: emailRef, text: 'spa@test.com',
    });
    expect(result.success).toBe(true);
  }, 20_000);

  it('should handle stale ref after SPA navigation (no page reload)', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/spa`);
    const snap1 = await sendToContentScript(browser, page, { action: 'snapshot' });
    const homeRef = extractRef(snap1.text, 'Home input');
    expect(homeRef).toBeTruthy();

    // Navigate away (replaces content via innerHTML)
    const aboutRef = extractRef(snap1.text, 'About');
    await sendToContentScript(browser, page, { action: 'click', ref: aboutRef });
    await new Promise(r => setTimeout(r, 300));

    // Old ref should be stale
    const result = await sendToContentScript(browser, page, {
      action: 'typeText', ref: homeRef, text: 'should fail',
    });
    expect(result.success).toBe(false);
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

function findLine(snapshotText: string, labelText: string): string | null {
  const lines = snapshotText.split('\n');
  for (const line of lines) {
    if (line.includes(labelText)) return line;
  }
  return null;
}
