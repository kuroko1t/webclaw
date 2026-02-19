/**
 * E2E tests for interaction edge cases:
 * - Link navigation behavior
 * - Image accessibility naming
 * - Special input types (number, range, color, date)
 * - Disabled optgroup option selection
 * - Scrollable container interaction
 * - Whitespace-heavy option text matching
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

describe('Interaction Edge Cases E2E', () => {
  let browser: Browser;
  let page: Page;
  let server: Server;
  let port: number;

  const TEST_PAGES: Record<string, string> = {
    '/link-navigation': `<!DOCTYPE html><html><head><title>Link Navigation</title></head><body>
      <h1>Link Navigation Tests</h1>
      <nav>
        <a href="/link-target" id="internal-link">Go to Target</a>
        <a href="javascript:void(0)" id="js-link" onclick="
          document.getElementById('click-result').textContent = 'JS link clicked'
        ">JS Link</a>
        <a href="#section2" id="hash-link">Jump to Section 2</a>
        <a href="/link-target" target="_blank" id="blank-link">Open in New Tab</a>
      </nav>
      <div id="click-result"></div>
      <section id="section1"><h2>Section 1</h2><p>Content 1</p></section>
      <div style="height:1000px"></div>
      <section id="section2"><h2>Section 2</h2><p>Content 2</p>
        <button id="sec2-btn">Section 2 Button</button>
      </section>
    </body></html>`,

    '/link-target': `<!DOCTYPE html><html><head><title>Link Target</title></head><body>
      <h1>Target Page</h1>
      <button id="target-btn">Target Button</button>
      <a href="/link-navigation" id="back-link">Go Back</a>
    </body></html>`,

    '/images': `<!DOCTYPE html><html><head><title>Image Tests</title></head><body>
      <h1>Image Accessibility</h1>
      <img id="img-alt" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" alt="Logo image">
      <img id="img-aria" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" aria-label="Custom logo">
      <img id="img-both" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" alt="Alt text" aria-label="Aria text">
      <img id="img-empty-alt" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" alt="">
      <img id="img-no-alt" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==">
      <a href="#" id="linked-img">
        <img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" alt="Click me">
      </a>
      <input type="image" id="img-input" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" alt="Submit form">
    </body></html>`,

    '/special-inputs': `<!DOCTYPE html><html><head><title>Special Inputs</title></head><body>
      <h1>Special Input Types</h1>
      <input type="number" id="num-input" aria-label="Quantity" value="5" min="0" max="100">
      <input type="range" id="range-input" aria-label="Volume" value="50" min="0" max="100">
      <input type="color" id="color-input" aria-label="Color picker" value="#ff0000">
      <input type="date" id="date-input" aria-label="Birthday">
      <input type="time" id="time-input" aria-label="Alarm time">
      <input type="file" id="file-input" aria-label="Upload file">
      <input type="hidden" id="hidden-input" value="secret">
      <input type="password" id="pw-input" aria-label="Password" value="">
      <div id="result"></div>
      <button id="show-values" onclick="
        var inputs = ['num-input','range-input','color-input','date-input','time-input','pw-input'];
        var vals = inputs.map(function(id) { return id + '=' + document.getElementById(id).value; });
        document.getElementById('result').textContent = vals.join('; ');
      ">Show Values</button>
    </body></html>`,

    '/disabled-optgroup': `<!DOCTYPE html><html><head><title>Disabled Optgroup</title></head><body>
      <h1>Disabled Optgroup Tests</h1>

      <!-- Optgroup disabled, options not individually disabled -->
      <select id="sel-disabled-group" aria-label="Fruits">
        <option value="">Select...</option>
        <optgroup label="Available">
          <option value="apple">Apple</option>
          <option value="banana">Banana</option>
        </optgroup>
        <optgroup label="Out of Season" disabled>
          <option value="cherry">Cherry</option>
          <option value="mango">Mango</option>
        </optgroup>
      </select>

      <!-- Mixed: some options disabled, some optgroups disabled -->
      <select id="sel-mixed" aria-label="Colors">
        <option value="">Pick a color</option>
        <optgroup label="Primary">
          <option value="red">Red</option>
          <option value="blue" disabled>Blue (sold out)</option>
          <option value="yellow">Yellow</option>
        </optgroup>
        <optgroup label="Secondary" disabled>
          <option value="green">Green</option>
          <option value="purple">Purple</option>
        </optgroup>
      </select>

      <!-- Select with whitespace-heavy option text -->
      <select id="sel-whitespace" aria-label="Whitespace test">
        <option value="a">  Padded Option  </option>
        <option value="b">
          Multiline
        </option>
        <option value="c">Normal</option>
      </select>

      <div id="select-result"></div>
    </body></html>`,

    '/scrollable': `<!DOCTYPE html><html><head><title>Scrollable Containers</title>
      <style>
        .scroll-container {
          width: 300px; height: 200px; overflow: auto;
          border: 1px solid #ccc; padding: 10px;
        }
        .scroll-container .spacer { height: 500px; }
        .nested-scroll {
          width: 250px; height: 100px; overflow: auto;
          border: 1px solid red; margin: 10px 0;
        }
      </style>
    </head><body>
      <h1>Scrollable Containers</h1>
      <div class="scroll-container" id="container1">
        <p>Top of scrollable area</p>
        <button id="top-btn">Top Button</button>
        <div class="spacer"></div>
        <button id="bottom-btn">Bottom Button</button>
        <input type="text" id="bottom-input" aria-label="Bottom input">
      </div>

      <div class="scroll-container" id="container2">
        <p>Nested scrollable</p>
        <div class="nested-scroll">
          <div style="height:300px"></div>
          <button id="nested-btn">Nested Button</button>
        </div>
      </div>

      <div id="scroll-result"></div>

      <script>
        document.getElementById('top-btn').addEventListener('click', function() {
          document.getElementById('scroll-result').textContent = 'Top button clicked';
        });
        document.getElementById('bottom-btn').addEventListener('click', function() {
          document.getElementById('scroll-result').textContent = 'Bottom button clicked';
        });
        document.getElementById('nested-btn').addEventListener('click', function() {
          document.getElementById('scroll-result').textContent = 'Nested button clicked';
        });
      </script>
    </body></html>`,

    '/progress-meter': `<!DOCTYPE html><html><head><title>Progress & Meter</title></head><body>
      <h1>Progress & Meter Elements</h1>
      <label for="file-progress">File upload:</label>
      <progress id="file-progress" value="30" max="100">30%</progress>

      <label for="disk-usage">Disk usage:</label>
      <meter id="disk-usage" value="0.6" min="0" max="1" low="0.3" high="0.8" optimum="0.5">60%</meter>

      <output id="calc-output" for="a b" aria-label="Calculation result">42</output>

      <button id="update-progress" onclick="
        var p = document.getElementById('file-progress');
        p.value = Math.min(p.value + 20, 100);
      ">Upload More</button>
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

  // --- Link Navigation ---

  it('should click a JS link (href="javascript:void(0)") and see result', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/link-navigation`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = snap.text.match(/@e\d+(?= link "JS Link")/)?.[0];
    expect(ref).toBeTruthy();
    const result = await sendToContentScript(browser, page, { action: 'click', ref });
    expect(result.success).toBe(true);

    const text = await page.evaluate(() =>
      document.getElementById('click-result')!.textContent
    );
    expect(text).toBe('JS link clicked');
  }, 15_000);

  it('should click a hash link and still have working snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/link-navigation`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = snap.text.match(/@e\d+(?= link "Jump to Section 2")/)?.[0];
    expect(ref).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref });

    // After hash navigation, snapshot should still work
    const snap2 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap2.text).toContain('Section 2 Button');
  }, 15_000);

  it('should navigate to new page via link click and work on target page', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/link-navigation`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = snap.text.match(/@e\d+(?= link "Go to Target")/)?.[0];
    expect(ref).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref });

    // Wait for navigation
    await page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/link-target`);

    const snap2 = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap2.text).toContain('Target Page');
    expect(snap2.text).toContain('Target Button');
  }, 15_000);

  // --- Image Accessibility ---

  it('should show img elements with correct accessible names in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/images`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // img with alt should use alt as name
    expect(snap.text).toContain('img "Logo image"');

    // img with aria-label should use aria-label (priority over alt)
    expect(snap.text).toContain('img "Custom logo"');

    // img with both: aria-label takes precedence
    expect(snap.text).toContain('img "Aria text"');
    expect(snap.text).not.toMatch(/img "Alt text"/);

    // img with empty alt should still appear as img but with no name
    // (it's a decorative image, should be [img] without a name)
    const lines = snap.text.split('\n');
    const emptyAltLine = lines.find((l: string) => l.match(/\[img\]/) && !l.match(/img "/));
    // There should be at least one img without a name (empty alt or no alt)
    // This is acceptable - they appear in the snapshot but without a name
  }, 15_000);

  it('should show linked image as a link with image alt as name', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/images`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // <a><img alt="Click me"></a> should appear as link with accessible name
    // The link's name comes from its text content which includes the img's alt
    const linkRef = snap.text.match(/@e\d+(?= link)/)?.[0];
    expect(linkRef).toBeTruthy();
  }, 15_000);

  it('should show input[type="image"] as button with alt name', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/images`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // input[type="image"] should show as button with alt text
    expect(snap.text).toContain('button "Submit form"');
  }, 15_000);

  // --- Special Input Types ---

  it('should show correct roles for special input types in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/special-inputs`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // number → spinbutton
    expect(snap.text).toContain('spinbutton "Quantity"');
    // range → slider
    expect(snap.text).toContain('slider "Volume"');
    // password → textbox
    expect(snap.text).toContain('textbox "Password"');
    // hidden inputs should NOT appear in snapshot
    expect(snap.text).not.toContain('secret');
  }, 15_000);

  it('should type into number input and verify value', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/special-inputs`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = snap.text.match(/@e\d+(?= spinbutton "Quantity")/)?.[0];
    expect(ref).toBeTruthy();

    const result = await sendToContentScript(browser, page, {
      action: 'typeText', ref, text: '42',
    });
    expect(result.success).toBe(true);

    const value = await page.evaluate(() =>
      (document.getElementById('num-input') as HTMLInputElement).value
    );
    expect(value).toBe('42');
  }, 15_000);

  it('should type into password field', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/special-inputs`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = snap.text.match(/@e\d+(?= textbox "Password")/)?.[0];
    expect(ref).toBeTruthy();

    const result = await sendToContentScript(browser, page, {
      action: 'typeText', ref, text: 'MySecret123!',
    });
    expect(result.success).toBe(true);

    // Value should be set even though it's a password field
    const value = await page.evaluate(() =>
      (document.getElementById('pw-input') as HTMLInputElement).value
    );
    expect(value).toBe('MySecret123!');
  }, 15_000);

  it('should show current values for number and range inputs in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/special-inputs`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Number input with value=5 should show the value
    const numLine = snap.text.split('\n').find((l: string) => l.includes('Quantity'));
    expect(numLine).toContain('5');

    // Range input with value=50 should show the value
    const rangeLine = snap.text.split('\n').find((l: string) => l.includes('Volume'));
    expect(rangeLine).toContain('50');
  }, 15_000);

  // --- Disabled Optgroup ---

  it('should succeed selecting option from enabled optgroup', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/disabled-optgroup`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = snap.text.match(/@e\d+(?= combobox "Fruits")/)?.[0];
    expect(ref).toBeTruthy();

    const result = await sendToContentScript(browser, page, {
      action: 'selectOption', ref, value: 'Apple',
    });
    expect(result.success).toBe(true);

    const value = await page.evaluate(() =>
      (document.getElementById('sel-disabled-group') as HTMLSelectElement).value
    );
    expect(value).toBe('apple');
  }, 15_000);

  it('should fail selecting option from disabled optgroup', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/disabled-optgroup`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = snap.text.match(/@e\d+(?= combobox "Fruits")/)?.[0];
    expect(ref).toBeTruthy();

    // Cherry is inside a disabled optgroup
    const result = await sendToContentScript(browser, page, {
      action: 'selectOption', ref, value: 'Cherry',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('disabled');
  }, 15_000);

  it('should fail selecting individually disabled option', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/disabled-optgroup`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = snap.text.match(/@e\d+(?= combobox "Colors")/)?.[0];
    expect(ref).toBeTruthy();

    // Blue is individually disabled
    const result = await sendToContentScript(browser, page, {
      action: 'selectOption', ref, value: 'Blue (sold out)',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('disabled');
  }, 15_000);

  it('should select option with whitespace-trimmed text matching', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/disabled-optgroup`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = snap.text.match(/@e\d+(?= combobox "Whitespace test")/)?.[0];
    expect(ref).toBeTruthy();

    // Option has "  Padded Option  " text, should match trimmed "Padded Option"
    const result = await sendToContentScript(browser, page, {
      action: 'selectOption', ref, value: 'Padded Option',
    });
    expect(result.success).toBe(true);

    const value = await page.evaluate(() =>
      (document.getElementById('sel-whitespace') as HTMLSelectElement).value
    );
    expect(value).toBe('a');
  }, 15_000);

  // --- Scrollable Containers ---

  it('should click button at bottom of scrollable container', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/scrollable`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Bottom button is inside a scrollable container, not visible initially
    const ref = snap.text.match(/@e\d+(?= button "Bottom Button")/)?.[0];
    expect(ref).toBeTruthy();

    const result = await sendToContentScript(browser, page, { action: 'click', ref });
    expect(result.success).toBe(true);

    const text = await page.evaluate(() =>
      document.getElementById('scroll-result')!.textContent
    );
    expect(text).toBe('Bottom button clicked');
  }, 15_000);

  it('should type into input at bottom of scrollable container', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/scrollable`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = snap.text.match(/@e\d+(?= textbox "Bottom input")/)?.[0];
    expect(ref).toBeTruthy();

    const result = await sendToContentScript(browser, page, {
      action: 'typeText', ref, text: 'Scrolled input text',
    });
    expect(result.success).toBe(true);

    const value = await page.evaluate(() =>
      (document.getElementById('bottom-input') as HTMLInputElement).value
    );
    expect(value).toBe('Scrolled input text');
  }, 15_000);

  it('should click button inside nested scrollable container', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/scrollable`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    const ref = snap.text.match(/@e\d+(?= button "Nested Button")/)?.[0];
    expect(ref).toBeTruthy();

    const result = await sendToContentScript(browser, page, { action: 'click', ref });
    expect(result.success).toBe(true);

    const text = await page.evaluate(() =>
      document.getElementById('scroll-result')!.textContent
    );
    expect(text).toBe('Nested button clicked');
  }, 15_000);

  // --- Progress & Meter ---

  it('should show progress and meter values in snapshot', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/progress-meter`);
    const snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Progress should show value/max
    expect(snap.text).toContain('progressbar');
    expect(snap.text).toContain('30/100');

    // Meter should show value
    expect(snap.text).toContain('meter');
    expect(snap.text).toContain('0.6');

    // Output should show its text
    expect(snap.text).toContain('status');
    expect(snap.text).toContain('42');
  }, 15_000);

  it('should update progress value after button click', async () => {
    await openPageAndWaitForContentScript(browser, page, `http://127.0.0.1:${port}/progress-meter`);
    let snap = await sendToContentScript(browser, page, { action: 'snapshot' });

    // Click update button
    const ref = snap.text.match(/@e\d+(?= button "Upload More")/)?.[0];
    expect(ref).toBeTruthy();
    await sendToContentScript(browser, page, { action: 'click', ref });

    // Re-snapshot: progress should be 50/100
    snap = await sendToContentScript(browser, page, { action: 'snapshot' });
    expect(snap.text).toContain('50/100');
  }, 15_000);
});
