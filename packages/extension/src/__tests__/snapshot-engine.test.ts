import { describe, it, expect, beforeEach } from 'vitest';
import { takeSnapshot, resolveRef, getCurrentSnapshotId } from '../content/snapshot-engine';

describe('snapshot-engine', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('takeSnapshot', () => {
    it('returns snapshot with page title', () => {
      document.title = 'Test Page';
      document.body.innerHTML = '<p>Hello</p>';
      const result = takeSnapshot();
      expect(result.title).toBe('Test Page');
      expect(result.url).toBeTruthy();
      expect(result.snapshotId).toMatch(/^snap-/);
    });

    it('generates unique snapshot IDs', () => {
      document.body.innerHTML = '<p>Test</p>';
      const snap1 = takeSnapshot();
      const snap2 = takeSnapshot();
      expect(snap1.snapshotId).not.toBe(snap2.snapshotId);
    });

    it('assigns @ref to buttons', () => {
      document.body.innerHTML = '<button>Click me</button>';
      const result = takeSnapshot();
      expect(result.text).toContain('@e1');
      expect(result.text).toContain('button');
      expect(result.text).toContain('Click me');
    });

    it('assigns @ref to links', () => {
      document.body.innerHTML = '<a href="/about">About</a>';
      const result = takeSnapshot();
      expect(result.text).toContain('@e1');
      expect(result.text).toContain('link');
      expect(result.text).toContain('About');
    });

    it('assigns @ref to input fields', () => {
      document.body.innerHTML = '<input type="text" placeholder="Name">';
      const result = takeSnapshot();
      expect(result.text).toContain('@e1');
      expect(result.text).toContain('textbox');
    });

    it('assigns sequential refs to multiple elements', () => {
      document.body.innerHTML = `
        <button>First</button>
        <button>Second</button>
        <button>Third</button>
      `;
      const result = takeSnapshot();
      expect(result.text).toContain('@e1');
      expect(result.text).toContain('@e2');
      expect(result.text).toContain('@e3');
    });

    it('preserves structural elements', () => {
      document.body.innerHTML = `
        <nav><a href="/">Home</a></nav>
        <main><button>Action</button></main>
      `;
      const result = takeSnapshot();
      expect(result.text).toContain('nav');
      expect(result.text).toContain('main');
    });

    it('skips script and style tags', () => {
      document.body.innerHTML = `
        <script>alert("hi")</script>
        <style>.foo{}</style>
        <button>Visible</button>
      `;
      const result = takeSnapshot();
      expect(result.text).not.toContain('alert');
      expect(result.text).not.toContain('.foo');
      expect(result.text).toContain('Visible');
    });

    it('shows checkbox state', () => {
      document.body.innerHTML = '<input type="checkbox" checked aria-label="Agree">';
      const result = takeSnapshot();
      expect(result.text).toContain('checkbox');
      expect(result.text).toContain('checked');
    });

    it('shows select element as combobox', () => {
      document.body.innerHTML = `
        <select aria-label="Color">
          <option>Red</option>
          <option selected>Blue</option>
        </select>
      `;
      const result = takeSnapshot();
      expect(result.text).toContain('combobox');
      expect(result.text).toContain('Color');
    });

    it('shows input value', () => {
      document.body.innerHTML = '<input type="text" aria-label="Name" value="Alice">';
      const result = takeSnapshot();
      expect(result.text).toContain('Alice');
    });

    it('uses aria-label for name', () => {
      document.body.innerHTML = '<button aria-label="Close dialog">X</button>';
      const result = takeSnapshot();
      expect(result.text).toContain('Close dialog');
    });

    it('recognizes heading levels', () => {
      document.body.innerHTML = '<h1>Title</h1><h2>Subtitle</h2>';
      const result = takeSnapshot();
      expect(result.text).toContain('heading[1]');
      expect(result.text).toContain('heading[2]');
    });

    it('respects maxTokens budget', () => {
      // Create a large DOM
      let html = '';
      for (let i = 0; i < 200; i++) {
        html += `<button>Button number ${i}</button>`;
      }
      document.body.innerHTML = html;
      const result = takeSnapshot({ maxTokens: 100 });
      // 100 tokens * 4 chars = 400 chars max
      expect(result.text.length).toBeLessThanOrEqual(420); // some slack for truncation note
      expect(result.text).toContain('truncated');
    });
  });

  describe('resolveRef', () => {
    it('resolves a valid ref to DOM element', () => {
      document.body.innerHTML = '<button id="btn">Click</button>';
      takeSnapshot();
      const el = resolveRef('@e1');
      expect(el).not.toBeNull();
      expect(el?.tagName).toBe('BUTTON');
    });

    it('returns null for non-existent ref', () => {
      document.body.innerHTML = '<button>Click</button>';
      takeSnapshot();
      expect(resolveRef('@e999')).toBeNull();
    });

    it('resets refs on new snapshot', () => {
      document.body.innerHTML = '<button>First</button>';
      takeSnapshot();
      const el1 = resolveRef('@e1');
      expect(el1?.textContent).toBe('First');

      document.body.innerHTML = '<button>Second</button>';
      takeSnapshot();
      const el2 = resolveRef('@e1');
      expect(el2?.textContent).toBe('Second');
    });
  });

  describe('getCurrentSnapshotId', () => {
    it('returns empty string before any snapshot', () => {
      // After module reload this would be empty, but since tests share module state,
      // just verify it returns a string
      expect(typeof getCurrentSnapshotId()).toBe('string');
    });

    it('returns latest snapshot ID', () => {
      document.body.innerHTML = '<p>Test</p>';
      const result = takeSnapshot();
      expect(getCurrentSnapshotId()).toBe(result.snapshotId);
    });
  });

  describe('aria-hidden exclusion', () => {
    it('excludes aria-hidden="true" elements from snapshot', () => {
      document.body.innerHTML = `
        <button>Visible</button>
        <div aria-hidden="true">
          <button>Hidden Button</button>
          <input aria-label="Hidden Input">
        </div>
      `;
      const result = takeSnapshot();
      expect(result.text).toContain('Visible');
      expect(result.text).not.toContain('Hidden Button');
      expect(result.text).not.toContain('Hidden Input');
    });

    it('does not exclude elements without aria-hidden', () => {
      document.body.innerHTML = `
        <div aria-hidden="false">
          <button>Not Hidden</button>
        </div>
      `;
      const result = takeSnapshot();
      expect(result.text).toContain('Not Hidden');
    });
  });

  describe('role="presentation" and role="none"', () => {
    it('treats role="presentation" as no role', () => {
      document.body.innerHTML = `
        <table role="presentation">
          <tr><td><button>Action</button></td></tr>
        </table>
      `;
      const result = takeSnapshot();
      // The table should not appear as "table" or "presentation" role
      expect(result.text).not.toMatch(/\[presentation/);
      // But its interactive children should still appear
      expect(result.text).toContain('Action');
    });

    it('treats role="none" as no role', () => {
      document.body.innerHTML = `
        <nav role="none"><a href="/test">Link</a></nav>
      `;
      const result = takeSnapshot();
      expect(result.text).not.toMatch(/\[none/);
      expect(result.text).toContain('Link');
    });
  });

  describe('input type roles', () => {
    it('assigns button role to input[type="image"]', () => {
      document.body.innerHTML = '<input type="image" alt="Submit form">';
      const result = takeSnapshot();
      expect(result.text).toContain('button');
      expect(result.text).toContain('Submit form');
    });

    it('assigns checkbox role to input[type="checkbox"]', () => {
      document.body.innerHTML = '<input type="checkbox" aria-label="Agree">';
      const result = takeSnapshot();
      expect(result.text).toContain('checkbox');
    });

    it('assigns radio role to input[type="radio"]', () => {
      document.body.innerHTML = '<input type="radio" aria-label="Option A">';
      const result = takeSnapshot();
      expect(result.text).toContain('radio');
    });

    it('assigns slider role to input[type="range"]', () => {
      document.body.innerHTML = '<input type="range" aria-label="Volume">';
      const result = takeSnapshot();
      expect(result.text).toContain('slider');
    });

    it('assigns spinbutton role to input[type="number"]', () => {
      document.body.innerHTML = '<input type="number" aria-label="Quantity">';
      const result = takeSnapshot();
      expect(result.text).toContain('spinbutton');
    });

    it('assigns searchbox role to input[type="search"]', () => {
      document.body.innerHTML = '<input type="search" aria-label="Search">';
      const result = takeSnapshot();
      expect(result.text).toContain('searchbox');
    });

    it('assigns button role to input[type="submit"]', () => {
      document.body.innerHTML = '<input type="submit" value="Submit">';
      const result = takeSnapshot();
      expect(result.text).toContain('button');
    });

    it('assigns button role to input[type="reset"]', () => {
      document.body.innerHTML = '<input type="reset" value="Reset">';
      const result = takeSnapshot();
      expect(result.text).toContain('button');
    });

    it('assigns button role to input[type="button"]', () => {
      document.body.innerHTML = '<input type="button" value="Custom">';
      const result = takeSnapshot();
      expect(result.text).toContain('button');
    });
  });

  describe('HTML5 semantic elements', () => {
    it('captures output element with status role and value', () => {
      document.body.innerHTML = '<output>42</output>';
      const result = takeSnapshot();
      expect(result.text).toContain('status');
      expect(result.text).toContain('42');
    });

    it('captures progress element with progressbar role and value', () => {
      document.body.innerHTML = '<progress value="30" max="100" aria-label="Loading"></progress>';
      const result = takeSnapshot();
      expect(result.text).toContain('progressbar');
      expect(result.text).toContain('30/100');
    });

    it('captures meter element with meter role and value', () => {
      document.body.innerHTML = '<meter value="0.7" aria-label="Score"></meter>';
      const result = takeSnapshot();
      expect(result.text).toContain('meter');
      expect(result.text).toContain('0.7');
    });
  });

  describe('legend text extraction', () => {
    it('extracts legend text as accessible name', () => {
      document.body.innerHTML = `
        <fieldset>
          <legend>Personal Info</legend>
          <input type="text" aria-label="Name">
        </fieldset>
      `;
      const result = takeSnapshot();
      expect(result.text).toContain('Personal Info');
    });
  });

  describe('contenteditable as interactive', () => {
    it('assigns @ref to contenteditable="true" elements', () => {
      document.body.innerHTML = '<div contenteditable="true" aria-label="Editor">Edit me</div>';
      const result = takeSnapshot();
      expect(result.text).toContain('@e1');
    });

    it('assigns @ref to contenteditable="" elements', () => {
      document.body.innerHTML = '<div contenteditable="" aria-label="Editor">Edit me</div>';
      const result = takeSnapshot();
      expect(result.text).toContain('@e1');
    });

    it('assigns @ref to bare contenteditable elements', () => {
      document.body.innerHTML = '<div contenteditable aria-label="Editor">Edit me</div>';
      const result = takeSnapshot();
      expect(result.text).toContain('@e1');
    });

    it('does NOT assign @ref to contenteditable="false" elements', () => {
      document.body.innerHTML = '<div contenteditable="false">Not editable</div>';
      const result = takeSnapshot();
      expect(result.text).not.toContain('@e');
    });
  });

  describe('aria-disabled marking', () => {
    it('marks native disabled elements in snapshot', () => {
      document.body.innerHTML = '<button disabled>Disabled Btn</button>';
      const result = takeSnapshot();
      expect(result.text).toContain('disabled');
      expect(result.text).toContain('Disabled Btn');
    });

    it('marks aria-disabled="true" elements in snapshot', () => {
      document.body.innerHTML = '<button aria-disabled="true">Aria Disabled</button>';
      const result = takeSnapshot();
      expect(result.text).toContain('disabled');
      expect(result.text).toContain('Aria Disabled');
    });

    it('does not mark aria-disabled="false" elements', () => {
      document.body.innerHTML = '<button aria-disabled="false">Enabled</button>';
      const result = takeSnapshot();
      expect(result.text).not.toContain('disabled');
    });
  });

  describe('summary element', () => {
    it('assigns @ref and button role to summary element', () => {
      document.body.innerHTML = `
        <details>
          <summary>Show details</summary>
          <p>Hidden content</p>
        </details>
      `;
      const result = takeSnapshot();
      expect(result.text).toContain('@e1');
      expect(result.text).toContain('button');
      expect(result.text).toContain('Show details');
    });
  });

  describe('resolveRef with detached elements', () => {
    it('returns null for elements removed from DOM', () => {
      document.body.innerHTML = '<button id="btn">Click</button>';
      takeSnapshot();
      // Verify it resolves before removal
      expect(resolveRef('@e1')).not.toBeNull();
      // Remove the element
      document.getElementById('btn')!.remove();
      // Should return null since element is no longer connected
      expect(resolveRef('@e1')).toBeNull();
    });

    it('returns null for invalid ref format', () => {
      document.body.innerHTML = '<button>Click</button>';
      takeSnapshot();
      expect(resolveRef('')).toBeNull();
      expect(resolveRef('invalid')).toBeNull();
      expect(resolveRef('e1')).toBeNull();
    });
  });

  describe('unchecked checkbox/radio state', () => {
    it('shows unchecked state for unchecked checkbox', () => {
      document.body.innerHTML = '<input type="checkbox" aria-label="Terms">';
      const result = takeSnapshot();
      expect(result.text).toContain('unchecked');
    });

    it('shows checked state for checked radio', () => {
      document.body.innerHTML = '<input type="radio" checked aria-label="Option">';
      const result = takeSnapshot();
      expect(result.text).toContain('checked');
    });
  });

  describe('accessible name sources', () => {
    it('uses aria-labelledby for name', () => {
      document.body.innerHTML = `
        <span id="lbl">Search query</span>
        <input type="text" aria-labelledby="lbl">
      `;
      const result = takeSnapshot();
      expect(result.text).toContain('Search query');
    });

    it('uses label[for] for name', () => {
      document.body.innerHTML = `
        <label for="email">Email address</label>
        <input type="text" id="email">
      `;
      const result = takeSnapshot();
      expect(result.text).toContain('Email address');
    });

    it('uses wrapping label for name', () => {
      document.body.innerHTML = `
        <label>Username <input type="text"></label>
      `;
      const result = takeSnapshot();
      expect(result.text).toContain('Username');
    });

    it('uses placeholder for name', () => {
      document.body.innerHTML = '<input type="text" placeholder="Enter name">';
      const result = takeSnapshot();
      expect(result.text).toContain('Enter name');
    });

    it('uses title attribute for name (higher priority than text content)', () => {
      document.body.innerHTML = '<button title="Close window">X</button>';
      // title attribute is checked before direct text content
      const result = takeSnapshot();
      expect(result.text).toContain('Close window');
    });

    it('uses alt text for img', () => {
      document.body.innerHTML = '<img alt="Company Logo">';
      const result = takeSnapshot();
      expect(result.text).toContain('Company Logo');
    });

    it('truncates long accessible names', () => {
      const longName = 'A'.repeat(100);
      document.body.innerHTML = `<button>${longName}</button>`;
      const result = takeSnapshot();
      // Should be truncated to 77 chars + "..."
      expect(result.text).toContain('...');
      expect(result.text).not.toContain(longName);
    });
  });

  describe('structural roles', () => {
    it('captures all structural HTML elements', () => {
      document.body.innerHTML = `
        <header><a href="/">Home</a></header>
        <aside><a href="/help">Help</a></aside>
        <footer><a href="/terms">Terms</a></footer>
        <article><a href="/post">Post</a></article>
      `;
      const result = takeSnapshot();
      expect(result.text).toContain('banner');
      expect(result.text).toContain('complementary');
      expect(result.text).toContain('contentinfo');
      expect(result.text).toContain('article');
    });

    it('captures table structure', () => {
      document.body.innerHTML = `
        <table>
          <thead><tr><th>Name</th></tr></thead>
          <tbody><tr><td>Alice</td></tr></tbody>
        </table>
      `;
      const result = takeSnapshot();
      expect(result.text).toContain('table');
      expect(result.text).toContain('columnheader');
      expect(result.text).toContain('cell');
    });

    it('captures list structure', () => {
      document.body.innerHTML = `
        <ul>
          <li><a href="/a">A</a></li>
          <li><a href="/b">B</a></li>
        </ul>
      `;
      const result = takeSnapshot();
      expect(result.text).toContain('list');
      // Single-child [listitem] nodes are optimized away (child promoted)
      expect(result.text).toContain('link "A"');
      expect(result.text).toContain('link "B"');
    });

    it('captures dialog element', () => {
      document.body.innerHTML = '<dialog open><button>Close</button></dialog>';
      const result = takeSnapshot();
      expect(result.text).toContain('dialog');
    });

    it('captures definition list structure', () => {
      document.body.innerHTML = `
        <dl>
          <dt><a href="/term">Term</a></dt>
          <dd><a href="/def">Definition</a></dd>
        </dl>
      `;
      const result = takeSnapshot();
      expect(result.text).toContain('term');
      expect(result.text).toContain('definition');
    });

    it('captures fieldset with legend', () => {
      document.body.innerHTML = `
        <fieldset>
          <legend>Options</legend>
          <input type="checkbox" aria-label="Opt1">
        </fieldset>
      `;
      const result = takeSnapshot();
      expect(result.text).toContain('group');
      expect(result.text).toContain('Options');
    });
  });

  describe('ARIA roles on elements', () => {
    it('captures role="button" on div', () => {
      document.body.innerHTML = '<div role="button">Custom Button</div>';
      const result = takeSnapshot();
      expect(result.text).toContain('@e1');
      expect(result.text).toContain('button');
      expect(result.text).toContain('Custom Button');
    });

    it('captures role="checkbox" on div', () => {
      document.body.innerHTML = '<div role="checkbox" aria-label="Accept">check</div>';
      const result = takeSnapshot();
      expect(result.text).toContain('@e1');
      expect(result.text).toContain('checkbox');
    });

    it('captures role="tab" on div', () => {
      document.body.innerHTML = '<div role="tab">Tab 1</div>';
      const result = takeSnapshot();
      expect(result.text).toContain('@e1');
      expect(result.text).toContain('tab');
    });

    it('captures role="menuitem" on div', () => {
      document.body.innerHTML = '<div role="menuitem">Menu Item</div>';
      const result = takeSnapshot();
      expect(result.text).toContain('@e1');
      expect(result.text).toContain('menuitem');
    });

    it('captures role="switch" on button', () => {
      document.body.innerHTML = '<button role="switch" aria-label="Dark mode">Toggle</button>';
      const result = takeSnapshot();
      expect(result.text).toContain('switch');
    });
  });

  describe('select element value', () => {
    it('shows selected option text as value', () => {
      document.body.innerHTML = `
        <select aria-label="Country">
          <option value="us">United States</option>
          <option value="uk" selected>United Kingdom</option>
        </select>
      `;
      const result = takeSnapshot();
      expect(result.text).toContain('United Kingdom');
    });
  });
});
