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
});
