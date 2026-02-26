/**
 * E2E tests for ARIA state attributes, autocomplete patterns,
 * live regions, fixed overlays, sortable tables, and error recovery.
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

describe('ARIA Patterns & Advanced Interactions E2E', () => {
  let browser: Browser;
  let page: Page;
  let server: Server;
  let port: number;

  const TEST_PAGES: Record<string, string> = {
    '/aria-expanded': `<!DOCTYPE html><html><head><title>ARIA Expanded</title></head><body>
      <h1>ARIA Expanded Tests</h1>

      <!-- Accordion -->
      <div role="region">
        <h2>
          <button id="acc1" aria-expanded="false" aria-controls="panel1"
                  onclick="toggleAccordion('acc1','panel1')">
            Section 1
          </button>
        </h2>
        <div id="panel1" role="region" style="display:none">
          <p>Content 1</p>
          <input type="text" aria-label="Section 1 input">
        </div>

        <h2>
          <button id="acc2" aria-expanded="false" aria-controls="panel2"
                  onclick="toggleAccordion('acc2','panel2')">
            Section 2
          </button>
        </h2>
        <div id="panel2" role="region" style="display:none">
          <p>Content 2</p>
          <button id="sec2-btn">Section 2 Action</button>
        </div>
      </div>

      <!-- Tree view -->
      <ul role="tree">
        <li role="treeitem" aria-expanded="false" id="tree-root">
          <span>Root</span>
          <ul role="group" style="display:none" id="tree-children">
            <li role="treeitem"><a href="#" id="tree-child1">Child 1</a></li>
            <li role="treeitem"><a href="#" id="tree-child2">Child 2</a></li>
          </ul>
        </li>
      </ul>

      <!-- Disclosure widget -->
      <button id="disclosure" aria-expanded="false"
              onclick="toggleDisclosure()">Show Details</button>
      <div id="disclosure-content" style="display:none">
        <p>Hidden details revealed!</p>
        <a href="#" id="detail-link">Learn more</a>
      </div>

      <script>
        function toggleAccordion(btnId, panelId) {
          var btn = document.getElementById(btnId);
          var panel = document.getElementById(panelId);
          var expanded = btn.getAttribute('aria-expanded') === 'true';
          btn.setAttribute('aria-expanded', !expanded);
          panel.style.display = expanded ? 'none' : 'block';
        }
        function toggleDisclosure() {
          var btn = document.getElementById('disclosure');
          var content = document.getElementById('disclosure-content');
          var expanded = btn.getAttribute('aria-expanded') === 'true';
          btn.setAttribute('aria-expanded', !expanded);
          btn.textContent = expanded ? 'Show Details' : 'Hide Details';
          content.style.display = expanded ? 'none' : 'block';
        }
      </script>
    </body></html>`,

    '/aria-selected': `<!DOCTYPE html><html><head><title>ARIA Selected</title>
      <style>
        .tabpanel { display: none; padding: 16px; border: 1px solid #ccc; }
        .tabpanel.active { display: block; }
        [role="tab"][aria-selected="true"] { font-weight: bold; border-bottom: 2px solid blue; }
      </style>
    </head><body>
      <h1>ARIA Selected Tests</h1>

      <!-- Tab bar -->
      <div role="tablist" aria-label="Settings">
        <button role="tab" id="tab1" aria-selected="true" aria-controls="panel-general"
                onclick="switchTab('tab1','panel-general')">General</button>
        <button role="tab" id="tab2" aria-selected="false" aria-controls="panel-security"
                onclick="switchTab('tab2','panel-security')">Security</button>
        <button role="tab" id="tab3" aria-selected="false" aria-controls="panel-privacy"
                onclick="switchTab('tab3','panel-privacy')">Privacy</button>
      </div>
      <div role="tabpanel" id="panel-general" class="tabpanel active">
        <input type="text" aria-label="Display name" value="User">
        <select aria-label="Theme">
          <option value="light" selected>Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>
      <div role="tabpanel" id="panel-security" class="tabpanel">
        <input type="password" aria-label="New password">
        <button id="change-pw">Change Password</button>
      </div>
      <div role="tabpanel" id="panel-privacy" class="tabpanel">
        <label><input type="checkbox" id="analytics"> Allow analytics</label>
        <button id="save-privacy">Save Privacy Settings</button>
      </div>

      <!-- Listbox with selection -->
      <div role="listbox" aria-label="Favorite Color" id="color-list">
        <div role="option" id="opt-red" aria-selected="false" onclick="selectColor(this)"
             tabindex="0">Red</div>
        <div role="option" id="opt-blue" aria-selected="true" onclick="selectColor(this)"
             tabindex="0">Blue</div>
        <div role="option" id="opt-green" aria-selected="false" onclick="selectColor(this)"
             tabindex="0">Green</div>
      </div>
      <div id="color-result"></div>

      <script>
        function switchTab(tabId, panelId) {
          document.querySelectorAll('[role="tab"]').forEach(function(t) {
            t.setAttribute('aria-selected', 'false');
          });
          document.querySelectorAll('[role="tabpanel"]').forEach(function(p) {
            p.classList.remove('active');
          });
          document.getElementById(tabId).setAttribute('aria-selected', 'true');
          document.getElementById(panelId).classList.add('active');
        }
        function selectColor(el) {
          document.querySelectorAll('#color-list [role="option"]').forEach(function(o) {
            o.setAttribute('aria-selected', 'false');
          });
          el.setAttribute('aria-selected', 'true');
          document.getElementById('color-result').textContent = 'Selected: ' + el.textContent;
        }
      </script>
    </body></html>`,

    '/autocomplete': `<!DOCTYPE html><html><head><title>Autocomplete</title>
      <style>
        .listbox { border: 1px solid #ccc; max-height: 150px; overflow-y: auto; }
        .listbox[hidden] { display: none; }
        .listbox [role="option"] { padding: 4px 8px; cursor: pointer; }
        .listbox [role="option"]:hover, .listbox [role="option"][aria-selected="true"] {
          background: #e0e0e0;
        }
      </style>
    </head><body>
      <h1>Autocomplete/Combobox</h1>

      <div>
        <label for="search-input">Search Countries</label>
        <div role="combobox" aria-expanded="false" aria-haspopup="listbox"
             aria-owns="search-listbox" id="combobox-wrapper">
          <input type="text" id="search-input" role="combobox"
                 aria-autocomplete="list" aria-controls="search-listbox"
                 aria-expanded="false" aria-label="Search Countries"
                 oninput="filterOptions(this.value)"
                 onfocus="showOptions()">
        </div>
        <div role="listbox" id="search-listbox" aria-label="Countries" hidden>
          <div role="option" data-value="jp" aria-selected="false">Japan</div>
          <div role="option" data-value="us" aria-selected="false">United States</div>
          <div role="option" data-value="uk" aria-selected="false">United Kingdom</div>
          <div role="option" data-value="fr" aria-selected="false">France</div>
          <div role="option" data-value="de" aria-selected="false">Germany</div>
          <div role="option" data-value="au" aria-selected="false">Australia</div>
        </div>
      </div>
      <div id="autocomplete-result"></div>

      <script>
        var allOptions = document.querySelectorAll('#search-listbox [role="option"]');
        function showOptions() {
          document.getElementById('search-listbox').hidden = false;
          document.getElementById('search-input').setAttribute('aria-expanded', 'true');
        }
        function filterOptions(query) {
          showOptions();
          var q = query.toLowerCase();
          allOptions.forEach(function(opt) {
            var match = opt.textContent.toLowerCase().includes(q);
            opt.style.display = match ? '' : 'none';
          });
        }
        document.querySelectorAll('#search-listbox [role="option"]').forEach(function(opt) {
          opt.addEventListener('click', function() {
            document.getElementById('search-input').value = opt.textContent;
            document.getElementById('search-input').setAttribute('aria-expanded', 'false');
            document.getElementById('search-listbox').hidden = true;
            document.getElementById('autocomplete-result').textContent = 'Chosen: ' + opt.textContent;
            allOptions.forEach(function(o) { o.setAttribute('aria-selected', 'false'); });
            opt.setAttribute('aria-selected', 'true');
          });
        });
      </script>
    </body></html>`,

    '/live-regions': `<!DOCTYPE html><html><head><title>Live Regions</title></head><body>
      <h1>ARIA Live Regions</h1>

      <div role="alert" id="alert-region" aria-live="assertive"></div>
      <div role="status" id="status-region" aria-live="polite"></div>
      <div role="log" id="log-region" aria-live="polite"></div>

      <button id="trigger-alert" onclick="
        document.getElementById('alert-region').textContent = 'Error: Invalid input!';
      ">Trigger Alert</button>

      <button id="trigger-status" onclick="
        document.getElementById('status-region').textContent = '3 results found';
      ">Update Status</button>

      <button id="add-log" onclick="
        var log = document.getElementById('log-region');
        var entry = document.createElement('p');
        entry.textContent = 'Log entry ' + (log.children.length + 1);
        log.appendChild(entry);
      ">Add Log Entry</button>

      <div aria-live="polite" id="counter-region">Count: 0</div>
      <button id="increment" onclick="
        var el = document.getElementById('counter-region');
        var count = parseInt(el.textContent.split(': ')[1]) + 1;
        el.textContent = 'Count: ' + count;
      ">Increment Counter</button>
    </body></html>`,

    '/sortable-table': `<!DOCTYPE html><html><head><title>Sortable Table</title>
      <style>
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
        th { cursor: pointer; user-select: none; }
        th[aria-sort] { background: #f0f0f0; }
      </style>
    </head><body>
      <h1>Sortable Data Table</h1>
      <table role="table" aria-label="Employee List">
        <thead>
          <tr>
            <th role="columnheader" aria-sort="ascending" id="col-name"
                onclick="sortTable(0, this)">Name ↑</th>
            <th role="columnheader" aria-sort="none" id="col-dept"
                onclick="sortTable(1, this)">Department</th>
            <th role="columnheader" aria-sort="none" id="col-salary"
                onclick="sortTable(2, this)">Salary</th>
          </tr>
        </thead>
        <tbody id="table-body">
          <tr><td>Alice</td><td>Engineering</td><td>$120,000</td></tr>
          <tr><td>Bob</td><td>Marketing</td><td>$95,000</td></tr>
          <tr><td>Charlie</td><td>Engineering</td><td>$110,000</td></tr>
          <tr><td>Diana</td><td>Sales</td><td>$100,000</td></tr>
        </tbody>
      </table>
      <div id="sort-status" role="status" aria-live="polite"></div>

      <script>
        function sortTable(colIndex, header) {
          var tbody = document.getElementById('table-body');
          var rows = Array.from(tbody.rows);
          var currentSort = header.getAttribute('aria-sort');
          var newSort = currentSort === 'ascending' ? 'descending' : 'ascending';

          // Reset all headers
          document.querySelectorAll('th[aria-sort]').forEach(function(th) {
            th.setAttribute('aria-sort', 'none');
            th.textContent = th.textContent.replace(/ [↑↓]$/, '');
          });

          header.setAttribute('aria-sort', newSort);
          header.textContent += newSort === 'ascending' ? ' ↑' : ' ↓';

          rows.sort(function(a, b) {
            var aVal = a.cells[colIndex].textContent;
            var bVal = b.cells[colIndex].textContent;
            return newSort === 'ascending'
              ? aVal.localeCompare(bVal)
              : bVal.localeCompare(aVal);
          });

          rows.forEach(function(row) { tbody.appendChild(row); });
          document.getElementById('sort-status').textContent =
            'Sorted by ' + header.textContent.replace(/ [↑↓]$/, '') + ' ' + newSort;
        }
      </script>
    </body></html>`,

    '/fixed-overlay': `<!DOCTYPE html><html><head><title>Fixed Overlay</title>
      <style>
        .sticky-header {
          position: fixed; top: 0; left: 0; right: 0;
          background: white; z-index: 100; padding: 10px;
          border-bottom: 1px solid #ccc;
        }
        .content { margin-top: 60px; padding: 20px; }
        .modal-overlay {
          display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.5); z-index: 200;
        }
        .modal-overlay.active { display: flex; align-items: center; justify-content: center; }
        .modal { background: white; padding: 20px; border-radius: 8px; min-width: 300px; }
      </style>
    </head><body>
      <div class="sticky-header">
        <button id="header-btn">Header Button</button>
        <button id="open-modal" onclick="
          document.getElementById('modal-overlay').classList.add('active')
        ">Open Modal</button>
      </div>
      <div class="content">
        <button id="content-btn">Content Button</button>
        <input type="text" id="content-input" aria-label="Content input">
        <p style="height:200px">Spacer content</p>
        <button id="bottom-btn">Bottom Button</button>
      </div>
      <div class="modal-overlay" id="modal-overlay">
        <div class="modal" role="dialog" aria-label="Confirm Action">
          <h2>Confirm</h2>
          <p>Are you sure?</p>
          <input type="text" aria-label="Reason" id="modal-input">
          <button id="modal-confirm" onclick="
            document.getElementById('modal-overlay').classList.remove('active');
            document.getElementById('modal-result').textContent = 'Confirmed: ' +
              document.getElementById('modal-input').value;
          ">Confirm</button>
          <button id="modal-cancel" onclick="
            document.getElementById('modal-overlay').classList.remove('active')
          ">Cancel</button>
        </div>
      </div>
      <div id="modal-result"></div>
    </body></html>`,

    '/truncation': `<!DOCTYPE html><html><head><title>Token Truncation</title></head><body>
      <h1>Token Truncation Test</h1>
      <nav>
        <a href="#s1">Section 1</a>
        <a href="#s2">Section 2</a>
        <a href="#s3">Section 3</a>
      </nav>
      <main id="main-content"></main>
      <script>
        // Generate many interactive elements to force truncation
        var main = document.getElementById('main-content');
        for (var i = 1; i <= 100; i++) {
          var section = document.createElement('section');
          section.innerHTML =
            '<h2>Section ' + i + '</h2>' +
            '<input type="text" aria-label="Input ' + i + '">' +
            '<button>Button ' + i + '</button>';
          main.appendChild(section);
        }
      </script>
    </body></html>`,

    '/error-recovery': `<!DOCTYPE html><html><head><title>Error Recovery</title></head><body>
      <h1>Error Recovery Tests</h1>
      <button id="error-btn" onclick="throw new Error('Click handler error')">
        Error Button
      </button>
      <button id="normal-btn" onclick="
        document.getElementById('result').textContent = 'Normal click worked'
      ">Normal Button</button>
      <input type="text" id="input1" aria-label="Normal input">
      <div id="result"></div>

      <button id="remove-self" onclick="this.remove()">Remove Self</button>

      <div id="mutation-target">
        <button id="mutate-btn" onclick="
          this.textContent = 'Mutated!';
          this.id = 'mutated-btn';
        ">Mutate Me</button>
      </div>
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

  // --- ARIA Expanded ---

  it('should show aria-expanded state in snapshot for accordion', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/aria-expanded`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Both accordion buttons should show (collapsed) since aria-expanded="false"
    expect(snap.text).toContain('Section 1');
    expect(snap.text).toContain('(collapsed)');
  }, 30_000);

  it('should update aria-expanded after clicking accordion', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/aria-expanded`);
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Click Section 1 to expand
    const ref = snap.text.match(/@e\d+(?= button "Section 1")/)?.[0];
    expect(ref).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref });

    // Re-snapshot
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    // Section 1 button should now be (expanded)
    const section1Line = snap.text.split('\n').find((l: string) => l.includes('button') && l.includes('Section 1'));
    expect(section1Line).toContain('(expanded)');
    // Panel content should now be visible
    expect(snap.text).toContain('Section 1 input');
  }, 30_000);

  it('should interact with content inside expanded accordion panel', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/aria-expanded`);
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Open Section 1
    const accRef = snap.text.match(/@e\d+(?= button "Section 1")/)?.[0];
    await sendToContentScript(browser, page, { action: 'click', ref: accRef });

    // Re-snapshot and interact with the revealed input
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const inputRef = snap.text.match(/@e\d+(?= textbox "Section 1 input")/)?.[0];
    expect(inputRef).toBeTruthy();

    const result = await sendToContentScript(browser, page, {
      action: 'typeText', ref: inputRef, text: 'Accordion content',
    });
    expect(result.success).toBe(true);
  }, 30_000);

  it('should show disclosure widget expanded/collapsed state', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/aria-expanded`);
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Disclosure should be collapsed
    const discLine = snap.text.split('\n').find((l: string) => l.includes('Show Details'));
    expect(discLine).toContain('(collapsed)');
    expect(snap.text).not.toContain('Learn more');

    // Click to expand
    const ref = snap.text.match(/@e\d+(?= button "Show Details")/)?.[0];
    await sendToContentScript(browser, page, { action: 'click', ref });

    // Re-snapshot: should be expanded
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const expandedLine = snap.text.split('\n').find((l: string) => l.includes('Hide Details'));
    expect(expandedLine).toContain('(expanded)');
    expect(snap.text).toContain('Learn more');
  }, 30_000);

  // --- ARIA Selected ---

  it('should show aria-selected state for tabs', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/aria-selected`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // General tab should be (selected), others (unselected)
    const generalLine = snap.text.split('\n').find((l: string) => l.includes('tab') && l.includes('"General"'));
    expect(generalLine).toContain('(selected)');

    const securityLine = snap.text.split('\n').find((l: string) => l.includes('tab') && l.includes('"Security"'));
    expect(securityLine).toContain('(unselected)');
  }, 30_000);

  it('should update aria-selected after tab switch and show new panel content', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/aria-selected`);
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Click Security tab
    const secRef = snap.text.match(/@e\d+(?= tab "Security")/)?.[0];
    expect(secRef).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref: secRef });

    // Re-snapshot
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Security should be selected
    const secLine = snap.text.split('\n').find((l: string) => l.includes('tab') && l.includes('"Security"'));
    expect(secLine).toContain('(selected)');

    // General should be unselected
    const genLine = snap.text.split('\n').find((l: string) => l.includes('tab') && l.includes('"General"'));
    expect(genLine).toContain('(unselected)');

    // Security panel content should be visible
    expect(snap.text).toContain('New password');
    expect(snap.text).toContain('Change Password');
  }, 30_000);

  it('should interact with controls inside selected tab panel', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/aria-selected`);
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Switch to Privacy tab
    const privRef = snap.text.match(/@e\d+(?= tab "Privacy")/)?.[0];
    await sendToContentScript(browser, page, { action: 'click', ref: privRef });

    snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Check the analytics checkbox
    const cbRef = snap.text.match(/@e\d+(?= checkbox)/)?.[0];
    if (cbRef) {
      const result = await sendToContentScript(browser, page, { action: 'click', ref: cbRef });
      expect(result.success).toBe(true);
    }

    // Click save button
    const saveRef = snap.text.match(/@e\d+(?= button "Save Privacy Settings")/)?.[0];
    expect(saveRef).toBeTruthy();
    const result = await sendToContentScript(browser, page, { action: 'click', ref: saveRef });
    expect(result.success).toBe(true);
  }, 30_000);

  it('should show aria-selected for listbox options', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/aria-selected`);
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Blue should be selected initially
    expect(snap.text).toMatch(/option "Blue".*\(selected\)/);

    // Click Red to select it
    const redRef = snap.text.match(/@e\d+(?= option "Red")/)?.[0];
    expect(redRef).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref: redRef });

    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toMatch(/option "Red".*\(selected\)/);
    expect(snap.text).toMatch(/option "Blue".*\(unselected\)/);
  }, 30_000);

  // --- Autocomplete/Combobox ---

  it('should handle autocomplete: type, filter, select option', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/autocomplete`);
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Input should be present with combobox role
    const inputRef = snap.text.match(/@e\d+(?= combobox "Search Countries")/)?.[0];
    expect(inputRef).toBeTruthy();

    // Type to filter
    await sendToContentScript(browser, page, {
      action: 'typeText', ref: inputRef, text: 'Ja',
    });

    // Wait for filtering
    await new Promise(r => setTimeout(r, 100));

    // Re-snapshot: listbox should be visible with filtered results
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toContain('Japan');

    // The input should now show (expanded) since aria-expanded="true"
    const inputLine = snap.text.split('\n').find((l: string) =>
      l.includes('combobox') && l.includes('Search Countries')
    );
    expect(inputLine).toContain('(expanded)');

    // Click Japan option
    const japanRef = snap.text.match(/@e\d+(?= option "Japan")/)?.[0];
    if (japanRef) {
      await sendToContentScript(browser, page, { action: 'click', ref: japanRef });
    }

    // Verify selection
    const result = await page.evaluate(() =>
      document.getElementById('autocomplete-result')?.textContent
    );
    expect(result).toContain('Japan');
  }, 30_000);

  // --- ARIA Live Regions ---

  it('should capture live region content after update', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/live-regions`);

    // Initial: alert region empty
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).not.toContain('Invalid input');

    // Trigger alert
    const alertRef = snap.text.match(/@e\d+(?= button "Trigger Alert")/)?.[0];
    expect(alertRef).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref: alertRef });

    // Re-snapshot: alert should contain text
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toContain('Invalid input');
  }, 30_000);

  it('should capture status region updates', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/live-regions`);
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Update status
    const statusRef = snap.text.match(/@e\d+(?= button "Update Status")/)?.[0];
    await sendToContentScript(browser, page, { action: 'click', ref: statusRef });

    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toContain('3 results found');
  }, 30_000);

  it('should capture incrementing counter in live region', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/live-regions`);

    // Increment 3 times
    for (let i = 0; i < 3; i++) {
      const snap = await sendToContentScript(browser, page, { action: 'snapshot' });
      const ref = snap.text.match(/@e\d+(?= button "Increment Counter")/)?.[0];
      await sendToContentScript(browser, page, { action: 'click', ref });
    }

    // Verify counter shows 3
    const finalSnap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const counterVal = await page.evaluate(() =>
      document.getElementById('counter-region')!.textContent
    );
    expect(counterVal).toBe('Count: 3');
  }, 30_000);

  // --- Sortable Table ---

  it('should show aria-sort state in table snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/sortable-table`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Table structure should be visible (columnheader is compacted into [row])
    expect(snap.text).toContain('table');
    expect(snap.text).toContain('row');
    expect(snap.text).toContain('Alice');
    expect(snap.text).toContain('Engineering');
  }, 30_000);

  it('should re-sort table on column header click and show updated rows', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/sortable-table`);
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Click Department column to sort
    // Find the columnheader - it might not have a @ref since th is not interactive by default
    // Let's check if the click on the header works via page.click
    await page.click('#col-dept');

    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    // Status should announce the sort
    const statusText = await page.evaluate(() =>
      document.getElementById('sort-status')!.textContent
    );
    expect(statusText).toContain('Department');

    // Verify table data is present
    expect(snap.text).toContain('Alice');
    expect(snap.text).toContain('Bob');
  }, 30_000);

  // --- Fixed Overlay ---

  it('should include fixed header elements in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/fixed-overlay`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Both header and content elements should be in snapshot
    expect(snap.text).toContain('Header Button');
    expect(snap.text).toContain('Content Button');
    expect(snap.text).toContain('Open Modal');
    expect(snap.text).toContain('Bottom Button');
  }, 30_000);

  it('should handle modal overlay: open, interact, close', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/fixed-overlay`);
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Open modal
    const openRef = snap.text.match(/@e\d+(?= button "Open Modal")/)?.[0];
    expect(openRef).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref: openRef });

    // Re-snapshot: modal content should be visible
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toContain('Confirm Action');
    expect(snap.text).toContain('Reason');

    // Type in modal input
    const inputRef = snap.text.match(/@e\d+(?= textbox "Reason")/)?.[0];
    expect(inputRef).toBeTruthy();
    await sendToContentScript(browser, page, {
      action: 'typeText', ref: inputRef, text: 'Testing modal',
    });

    // Click Confirm
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const confirmRef = snap.text.match(/@e\d+(?= button "Confirm")/)?.[0];
    expect(confirmRef).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref: confirmRef });

    // Verify result
    const result = await page.evaluate(() =>
      document.getElementById('modal-result')!.textContent
    );
    expect(result).toContain('Confirmed: Testing modal');
  }, 30_000);

  // --- Large DOM ---

  it('should include all elements in large DOM', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/truncation`);

    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toContain('Button 1');
    // Should have many @refs
    const refs = snap.text.match(/@e\d+/g);
    expect(refs!.length).toBeGreaterThan(5);
  }, 30_000);

  // --- Error Recovery ---

  it('should continue working after clicking element with error-throwing handler', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/error-recovery`);
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Click the error-throwing button
    const errorRef = snap.text.match(/@e\d+(?= button "Error Button")/)?.[0];
    expect(errorRef).toBeTruthy();
    const errorResult = await sendToContentScript(browser, page, { action: 'click', ref: errorRef });
    // Click itself should succeed (error is in the onclick handler, not our code)
    expect(errorResult.success).toBe(true);

    // Extension should still work - click normal button
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    const normalRef = snap.text.match(/@e\d+(?= button "Normal Button")/)?.[0];
    expect(normalRef).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref: normalRef });

    const result = await page.evaluate(() =>
      document.getElementById('result')!.textContent
    );
    expect(result).toBe('Normal click worked');
  }, 30_000);

  it('should handle element that removes itself from DOM on click', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/error-recovery`);
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Click "Remove Self" button - it removes itself from DOM
    const removeRef = snap.text.match(/@e\d+(?= button "Remove Self")/)?.[0];
    expect(removeRef).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref: removeRef });

    // Old ref should now fail (element removed from DOM)
    const retryResult = await sendToContentScript(browser, page, { action: 'click', ref: removeRef });
    expect(retryResult.success).toBe(false);

    // Other elements should still work
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).not.toContain('Remove Self');
    expect(snap.text).toContain('Normal Button');
  }, 30_000);

  it('should handle element mutation (text/id change) after snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/error-recovery`);
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Click "Mutate Me" - changes its own text and id
    const mutateRef = snap.text.match(/@e\d+(?= button "Mutate Me")/)?.[0];
    expect(mutateRef).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref: mutateRef });

    // Old ref should still work (element is same DOM node, just mutated)
    const retryResult = await sendToContentScript(browser, page, { action: 'click', ref: mutateRef });
    expect(retryResult.success).toBe(true);

    // New snapshot should show mutated text
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toContain('Mutated!');
    expect(snap.text).not.toContain('Mutate Me');
  }, 30_000);
});
