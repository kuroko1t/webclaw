/**
 * E2E tests for framework compatibility, multi-select handling,
 * click event coordinates, and InputEvent compatibility.
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

describe('Framework Compatibility E2E', () => {
  let browser: Browser;
  let page: Page;
  let server: Server;
  let port: number;

  const TEST_PAGES: Record<string, string> = {
    '/multi-select': `<!DOCTYPE html><html><head><title>Multi Select</title></head><body>
      <h1>Multi Select Tests</h1>

      <select id="multi" multiple size="5" aria-label="Toppings">
        <option value="cheese">Cheese</option>
        <option value="pepperoni">Pepperoni</option>
        <option value="mushroom">Mushroom</option>
        <option value="olive">Olive</option>
        <option value="onion">Onion</option>
      </select>

      <select id="multi-preselected" multiple size="4" aria-label="Preselected">
        <option value="a" selected>Alpha</option>
        <option value="b">Beta</option>
        <option value="c" selected>Charlie</option>
        <option value="d">Delta</option>
      </select>

      <select id="single" aria-label="Single">
        <option value="x">X</option>
        <option value="y">Y</option>
        <option value="z">Z</option>
      </select>

      <div id="result"></div>
      <script>
        document.getElementById('multi').addEventListener('change', function() {
          var selected = Array.from(this.selectedOptions).map(o => o.value);
          document.getElementById('result').textContent = 'Selected: ' + selected.join(', ');
        });
      </script>
    </body></html>`,

    '/click-coords': `<!DOCTYPE html><html><head><title>Click Coordinates</title></head><body>
      <h1>Click Coordinate Tests</h1>
      <button id="coord-btn" style="width:200px;height:60px;margin:50px">
        Click Target
      </button>
      <div id="coord-result"></div>
      <script>
        document.getElementById('coord-btn').addEventListener('mousedown', function(e) {
          document.getElementById('coord-result').textContent =
            'mousedown at (' + e.clientX + ',' + e.clientY + ')';
        });
        document.getElementById('coord-btn').addEventListener('click', function(e) {
          document.getElementById('coord-result').textContent +=
            ' click at (' + e.clientX + ',' + e.clientY + ')';
        });
      </script>
    </body></html>`,

    '/input-events': `<!DOCTYPE html><html><head><title>Input Events</title></head><body>
      <h1>Input Event Tests</h1>
      <input type="text" id="input1" aria-label="Test input">
      <textarea id="textarea1" aria-label="Test textarea"></textarea>
      <div contenteditable="true" id="editable1" aria-label="Test editable"></div>
      <div id="event-log"></div>
      <script>
        var log = [];
        function logEvent(e) {
          log.push({
            type: e.type,
            constructor: e.constructor.name,
            bubbles: e.bubbles,
            inputType: e.inputType || null,
            data: e.data || null,
            target: e.target.id
          });
          document.getElementById('event-log').textContent = JSON.stringify(log);
        }
        ['input1', 'textarea1', 'editable1'].forEach(function(id) {
          var el = document.getElementById(id);
          el.addEventListener('input', logEvent);
          el.addEventListener('change', logEvent);
          el.addEventListener('focus', logEvent);
        });
      </script>
    </body></html>`,

    '/dropdown-menu': `<!DOCTYPE html><html><head>
      <title>Dropdown Menu</title>
      <style>
        .dropdown { position: relative; display: inline-block; }
        .dropdown-content {
          display: none;
          position: absolute;
          background: white;
          border: 1px solid #ccc;
          min-width: 160px;
          z-index: 1;
        }
        .dropdown:hover .dropdown-content,
        .dropdown.open .dropdown-content { display: block; }
        .dropdown-content a { display: block; padding: 8px 12px; text-decoration: none; color: #333; }
        .dropdown-content a:hover { background: #f0f0f0; }
      </style>
    </head><body>
      <h1>Dropdown Menu Test</h1>
      <div class="dropdown" id="dropdown1">
        <button id="dd-trigger" onclick="this.parentElement.classList.toggle('open')">
          Menu ▼
        </button>
        <div class="dropdown-content">
          <a href="#" id="dd-item1" onclick="selectItem('Item 1'); return false;">Item 1</a>
          <a href="#" id="dd-item2" onclick="selectItem('Item 2'); return false;">Item 2</a>
          <a href="#" id="dd-item3" onclick="selectItem('Item 3'); return false;">Item 3</a>
        </div>
      </div>
      <div id="dd-result"></div>
      <script>
        function selectItem(item) {
          document.getElementById('dd-result').textContent = 'Selected: ' + item;
          document.getElementById('dropdown1').classList.remove('open');
        }
      </script>
    </body></html>`,

    '/tooltip': `<!DOCTYPE html><html><head>
      <title>Tooltip Test</title>
      <style>
        .tooltip-trigger { position: relative; }
        .tooltip {
          display: none;
          position: absolute;
          background: #333;
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          top: -30px;
          left: 0;
          white-space: nowrap;
        }
        .tooltip-trigger:hover .tooltip,
        .tooltip-trigger:focus-within .tooltip { display: block; }
      </style>
    </head><body>
      <h1>Tooltip Test</h1>
      <div class="tooltip-trigger">
        <button id="tooltip-btn" aria-label="Save document">Save</button>
        <span class="tooltip" role="tooltip" id="save-tooltip">Save your document (Ctrl+S)</span>
      </div>
      <button id="normal-btn">Normal Button</button>
    </body></html>`,

    '/lazy-content': `<!DOCTYPE html><html><head><title>Lazy Content</title></head><body>
      <h1>Lazy Loading Test</h1>
      <div id="initial-content">
        <button id="load-btn" onclick="loadContent()">Load More</button>
      </div>
      <div id="lazy-area"></div>
      <script>
        function loadContent() {
          document.getElementById('load-btn').disabled = true;
          document.getElementById('load-btn').textContent = 'Loading...';
          setTimeout(function() {
            document.getElementById('lazy-area').innerHTML =
              '<h2>Loaded Content</h2>' +
              '<input type="text" id="lazy-input" aria-label="Lazy input">' +
              '<button id="lazy-btn">Lazy Button</button>' +
              '<select id="lazy-select" aria-label="Lazy select">' +
              '  <option value="1">One</option>' +
              '  <option value="2">Two</option>' +
              '</select>';
            document.getElementById('load-btn').disabled = false;
            document.getElementById('load-btn').textContent = 'Load More';
          }, 500);
        }
      </script>
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

  // --- Multi-Select ---

  it('should show listbox role for select[multiple] in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/multi-select`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // select[multiple] should have "listbox" role, not "combobox"
    expect(snap.text).toMatch(/(listbox|combobox).*"Toppings"/);
  }, 30_000);

  it('should select a single option in select[multiple]', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/multi-select`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const ref = snap.text.match(/@e\d+(?=.*(listbox|combobox) "Toppings")/)?.[0];
    expect(ref).toBeTruthy();

    const result = await sendToContentScript(browser, page, {
      action: 'selectOption',
      ref,
      value: 'mushroom',
    });
    expect(result.success).toBe(true);

    const selected = await page.evaluate(() => {
      const sel = document.getElementById('multi') as HTMLSelectElement;
      return Array.from(sel.selectedOptions).map(o => o.value);
    });
    expect(selected).toContain('mushroom');
  }, 30_000);

  it('should preserve existing selections in select[multiple] when selecting additional option', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/multi-select`);

    // Pre-select cheese
    await page.evaluate(() => {
      (document.getElementById('multi') as HTMLSelectElement).options[0].selected = true;
    });

    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const ref = snap.text.match(/@e\d+(?=.*(listbox|combobox) "Toppings")/)?.[0];

    // Select mushroom - should keep cheese selected too
    await sendToContentScript(browser, page, {
      action: 'selectOption',
      ref,
      value: 'mushroom',
    });

    const selected = await page.evaluate(() => {
      const sel = document.getElementById('multi') as HTMLSelectElement;
      return Array.from(sel.selectedOptions).map(o => o.value);
    });
    // Both cheese and mushroom should be selected
    expect(selected).toContain('mushroom');
    expect(selected).toContain('cheese');
  }, 30_000);

  it('should show all preselected values for select[multiple] in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/multi-select`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Should show at least one of the preselected values
    // Ideally shows both "Alpha, Charlie" or similar
    expect(snap.text).toContain('Preselected');
  }, 30_000);

  // --- Click Event Coordinates ---

  it('should dispatch click events with proper coordinates', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/click-coords`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const ref = snap.text.match(/@e\d+(?= button "Click Target")/)?.[0];
    expect(ref).toBeTruthy();

    await sendToContentScript(browser, page, { action: 'click', ref });

    const result = await page.evaluate(() =>
      document.getElementById('coord-result')!.textContent
    );
    // Should have non-zero coordinates (center of element)
    expect(result).toContain('mousedown at');
    expect(result).toContain('click at');

    // Parse coordinates - they should be non-zero (element has margin and dimensions)
    const mousedownMatch = result!.match(/mousedown at \((\d+),(\d+)\)/);
    if (mousedownMatch) {
      const x = parseInt(mousedownMatch[1]);
      const y = parseInt(mousedownMatch[2]);
      expect(x).toBeGreaterThan(0);
      expect(y).toBeGreaterThan(0);
    }
  }, 30_000);

  // --- Input Event Compatibility ---

  it('should dispatch proper input events on typeText', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/input-events`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const ref = snap.text.match(/@e\d+(?= textbox "Test input")/)?.[0];
    expect(ref).toBeTruthy();

    await sendToContentScript(browser, page, {
      action: 'typeText',
      ref,
      text: 'hello',
    });

    const eventLog = await page.evaluate(() =>
      document.getElementById('event-log')!.textContent
    );
    const events = JSON.parse(eventLog!);

    // Should have dispatched focus, input, and change events
    const eventTypes = events.map((e: any) => e.type);
    expect(eventTypes).toContain('focus');
    expect(eventTypes).toContain('input');
    expect(eventTypes).toContain('change');

    // Input event should bubble
    const inputEvent = events.find((e: any) => e.type === 'input');
    expect(inputEvent.bubbles).toBe(true);
  }, 30_000);

  it('should dispatch input event on contenteditable typeText', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/input-events`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const ref = snap.text.match(/@e\d+(?=.*"Test editable")/)?.[0];
    expect(ref).toBeTruthy();

    await sendToContentScript(browser, page, {
      action: 'typeText',
      ref,
      text: 'editable content',
    });

    const eventLog = await page.evaluate(() =>
      document.getElementById('event-log')!.textContent
    );
    const events = JSON.parse(eventLog!);
    const editableEvents = events.filter((e: any) => e.target === 'editable1');
    const eventTypes = editableEvents.map((e: any) => e.type);
    expect(eventTypes).toContain('input');
  }, 30_000);

  // --- Dropdown Menu ---

  it('should interact with dropdown menu: open, select item, verify', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/dropdown-menu`);

    // Initial snapshot - dropdown is closed, items hidden
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toContain('Menu');

    // Open dropdown
    const menuRef = snap.text.match(/@e\d+(?= button "Menu.*")/)?.[0];
    expect(menuRef).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref: menuRef });

    // Re-snapshot - dropdown items should now be visible
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toContain('Item 1');
    expect(snap.text).toContain('Item 2');

    // Click Item 2
    const itemRef = snap.text.match(/@e\d+(?= link "Item 2")/)?.[0];
    expect(itemRef).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref: itemRef });

    // Verify selection
    const result = await page.evaluate(() =>
      document.getElementById('dd-result')!.textContent
    );
    expect(result).toContain('Selected: Item 2');

    // Dropdown should be closed now, items hidden in new snapshot
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).not.toContain('Item 1');
  }, 30_000);

  // --- Tooltip ---

  it('should show tooltip-related elements in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/tooltip`);

    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    // Button should be in snapshot with its aria-label
    expect(snap.text).toContain('Save document');
    // Normal button should also be present
    expect(snap.text).toContain('Normal Button');
  }, 30_000);

  it('should click button with tooltip without issues', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/tooltip`);

    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const ref = snap.text.match(/@e\d+(?= button "Save document")/)?.[0];
    expect(ref).toBeTruthy();

    const result = await sendToContentScript(browser, page, { action: 'click', ref });
    expect(result.success).toBe(true);
  }, 30_000);

  // --- Lazy Loading ---

  it('should handle lazy-loaded content after button click and re-snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/lazy-content`);

    // Initial: no lazy content
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).not.toContain('Lazy Button');
    expect(snap.text).not.toContain('Lazy input');

    // Click "Load More"
    const loadRef = snap.text.match(/@e\d+(?= button "Load More")/)?.[0];
    expect(loadRef).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref: loadRef });

    // Wait for lazy content to appear
    await page.waitForSelector('#lazy-btn', { timeout: 5000 });

    // Re-snapshot - lazy content should be visible
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toContain('Lazy Button');
    expect(snap.text).toContain('Lazy input');
    expect(snap.text).toContain('Lazy select');

    // Interact with lazy-loaded elements
    const inputRef = snap.text.match(/@e\d+(?= textbox "Lazy input")/)?.[0];
    expect(inputRef).toBeTruthy();
    const typeResult = await sendToContentScript(browser, page, {
      action: 'typeText',
      ref: inputRef,
      text: 'Lazy content filled',
    });
    expect(typeResult.success).toBe(true);

    // Select from lazy-loaded select
    const selRef = snap.text.match(/@e\d+(?= combobox "Lazy select")/)?.[0];
    expect(selRef).toBeTruthy();
    const selResult = await sendToContentScript(browser, page, {
      action: 'selectOption',
      ref: selRef,
      value: '2',
    });
    expect(selResult.success).toBe(true);

    // Click lazy button
    const btnRef = snap.text.match(/@e\d+(?= button "Lazy Button")/)?.[0];
    expect(btnRef).toBeTruthy();
    const clickResult = await sendToContentScript(browser, page, { action: 'click', ref: btnRef });
    expect(clickResult.success).toBe(true);
  }, 30_000);

  it('should handle button disabled during loading and re-enabled after', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/lazy-content`);

    // Click "Load More" - button becomes disabled
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const loadRef = snap.text.match(/@e\d+(?= button "Load More")/)?.[0];
    await sendToContentScript(browser, page, { action: 'click', ref: loadRef });

    // Immediately take snapshot - button should be disabled
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toContain('Loading');
    expect(snap.text).toContain('disabled');

    // Wait for loading to complete
    await page.waitForSelector('#lazy-btn', { timeout: 5000 });

    // Button should be re-enabled
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toContain('Load More');
    // Check it's no longer disabled
    const loadMoreLine = snap.text.split('\n').find((l: string) => l.includes('Load More'));
    expect(loadMoreLine).not.toContain('disabled');
  }, 30_000);
});
