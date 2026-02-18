/**
 * Snapshot + Action integration tests.
 *
 * Tests the full workflow: HTML → snapshot → ref resolution → DOM action → re-snapshot.
 * Uses jsdom (configured via vitest) to simulate a real browser DOM.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { takeSnapshot, resolveRef, getCurrentSnapshotId } from '../content/snapshot-engine';
import { clickElement, typeText, selectOption } from '../content/action-executor';

describe('Snapshot → Action → Re-snapshot integration', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.title = 'Integration Test';
  });

  // --- Text input workflow ---
  describe('text input workflow', () => {
    it('snapshot → ref → typeText → re-snapshot shows updated value', () => {
      document.body.innerHTML = '<input type="text" aria-label="Username" />';

      const snap1 = takeSnapshot();
      expect(snap1.text).toContain('textbox');
      expect(snap1.text).toContain('@e1');

      const el = resolveRef('@e1');
      expect(el).not.toBeNull();
      expect(el!.tagName).toBe('INPUT');

      const result = typeText('@e1', 'alice');
      expect(result.success).toBe(true);

      const input = document.querySelector('input') as HTMLInputElement;
      expect(input.value).toBe('alice');

      const snap2 = takeSnapshot();
      expect(snap2.snapshotId).not.toBe(snap1.snapshotId);
      expect(snap2.text).toContain('alice');
    });

    it('typeText with clearFirst=false appends to existing value', () => {
      document.body.innerHTML = '<input type="text" value="hello " aria-label="Msg" />';

      takeSnapshot();
      typeText('@e1', 'world', false);

      const snap2 = takeSnapshot();
      expect(snap2.text).toContain('hello world');
    });
  });

  // --- Button click workflow ---
  describe('button click workflow', () => {
    it('snapshot → ref → click → DOM changes confirmed', () => {
      document.body.innerHTML = `
        <div id="status">ready</div>
        <button id="btn">Go</button>
      `;
      document.getElementById('btn')!.addEventListener('click', () => {
        document.getElementById('status')!.textContent = 'clicked!';
      });

      const snap1 = takeSnapshot();
      expect(snap1.text).toContain('button');
      expect(snap1.text).toContain('Go');

      const result = clickElement('@e1');
      expect(result.success).toBe(true);
      expect(document.getElementById('status')!.textContent).toBe('clicked!');
    });

    it('clicking a button that adds DOM elements shows them in re-snapshot', () => {
      document.body.innerHTML = `
        <div id="list"></div>
        <button id="addBtn">Add Item</button>
      `;
      document.getElementById('addBtn')!.addEventListener('click', () => {
        const item = document.createElement('button');
        item.textContent = 'New Item';
        document.getElementById('list')!.appendChild(item);
      });

      takeSnapshot();
      clickElement('@e1');

      const snap2 = takeSnapshot();
      expect(snap2.text).toContain('New Item');
      // The new button should also have a @ref
      expect(snap2.text).toContain('@e1');
      expect(snap2.text).toContain('@e2');
    });
  });

  // --- Select workflow ---
  describe('select workflow', () => {
    it('snapshot → ref → selectOption → value changes in re-snapshot', () => {
      document.body.innerHTML = `
        <select aria-label="Color">
          <option value="r">Red</option>
          <option value="g">Green</option>
          <option value="b">Blue</option>
        </select>
      `;

      const snap1 = takeSnapshot();
      expect(snap1.text).toContain('combobox');
      expect(snap1.text).toContain('Color');

      const result = selectOption('@e1', 'g');
      expect(result.success).toBe(true);

      const select = document.querySelector('select') as HTMLSelectElement;
      expect(select.value).toBe('g');

      const snap2 = takeSnapshot();
      expect(snap2.text).toContain('Green');
    });

    it('selectOption by text label works', () => {
      document.body.innerHTML = `
        <select aria-label="Size">
          <option value="s">Small</option>
          <option value="m">Medium</option>
          <option value="l">Large</option>
        </select>
      `;

      takeSnapshot();
      const result = selectOption('@e1', 'Large');
      expect(result.success).toBe(true);

      const select = document.querySelector('select') as HTMLSelectElement;
      expect(select.value).toBe('l');
    });
  });

  // --- Login form workflow ---
  describe('login form workflow', () => {
    it('username → password → submit full flow', () => {
      let submitted = false;
      document.body.innerHTML = `
        <form id="login">
          <input type="text" aria-label="Username" />
          <input type="password" aria-label="Password" />
          <button type="submit">Log in</button>
        </form>
      `;
      document.getElementById('login')!.addEventListener('submit', (e) => {
        e.preventDefault();
        submitted = true;
      });

      // Step 1: Take snapshot
      const snap1 = takeSnapshot();
      expect(snap1.text).toContain('textbox');
      expect(snap1.text).toContain('Username');
      expect(snap1.text).toContain('Password');
      expect(snap1.text).toContain('Log in');

      // Step 2: Type username (first textbox = @e1)
      const r1 = typeText('@e1', 'admin');
      expect(r1.success).toBe(true);

      // Step 3: Type password (second textbox = @e2)
      const r2 = typeText('@e2', 'secret123');
      expect(r2.success).toBe(true);

      // Step 4: Click submit (button = @e3)
      const r3 = clickElement('@e3');
      expect(r3.success).toBe(true);
      expect(submitted).toBe(true);

      // Step 5: Verify values
      const inputs = document.querySelectorAll('input');
      expect((inputs[0] as HTMLInputElement).value).toBe('admin');
      expect((inputs[1] as HTMLInputElement).value).toBe('secret123');
    });
  });

  // --- Empty DOM ---
  describe('empty DOM', () => {
    it('snapshot of empty body returns only page role', () => {
      document.body.innerHTML = '';
      const snap = takeSnapshot();
      expect(snap.text).toContain('page');
      // No interactive elements
      expect(snap.text).not.toContain('@e1');
    });

    it('snapshot of non-interactive-only DOM has no refs', () => {
      document.body.innerHTML = '<div><p>Hello world</p></div>';
      const snap = takeSnapshot();
      expect(snap.text).not.toContain('@e');
    });
  });

  // --- Ref stability ---
  describe('ref stability and remapping', () => {
    it('refs reset on new snapshot', () => {
      document.body.innerHTML = '<button>First</button>';
      takeSnapshot();
      const el1 = resolveRef('@e1');
      expect(el1!.textContent).toBe('First');

      document.body.innerHTML = '<button>Second</button>';
      takeSnapshot();
      const el2 = resolveRef('@e1');
      expect(el2!.textContent).toBe('Second');
    });

    it('adding elements shifts refs in new snapshot', () => {
      document.body.innerHTML = '<button>A</button><button>B</button>';
      takeSnapshot();
      expect(resolveRef('@e1')!.textContent).toBe('A');
      expect(resolveRef('@e2')!.textContent).toBe('B');

      // Prepend a new button
      const newBtn = document.createElement('button');
      newBtn.textContent = 'Z';
      document.body.insertBefore(newBtn, document.body.firstChild);

      takeSnapshot();
      // Now Z should be @e1, A should be @e2, B should be @e3
      expect(resolveRef('@e1')!.textContent).toBe('Z');
      expect(resolveRef('@e2')!.textContent).toBe('A');
      expect(resolveRef('@e3')!.textContent).toBe('B');
    });

    it('getCurrentSnapshotId matches latest snapshot', () => {
      document.body.innerHTML = '<button>Test</button>';
      const snap = takeSnapshot();
      expect(getCurrentSnapshotId()).toBe(snap.snapshotId);

      const snap2 = takeSnapshot();
      expect(getCurrentSnapshotId()).toBe(snap2.snapshotId);
      expect(snap2.snapshotId).not.toBe(snap.snapshotId);
    });
  });

  // --- Complex DOM ---
  describe('complex DOM structures', () => {
    it('handles nested forms with multiple field types', () => {
      document.body.innerHTML = `
        <form>
          <input type="text" aria-label="Name" />
          <input type="email" aria-label="Email" />
          <textarea aria-label="Bio"></textarea>
          <select aria-label="Role">
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
          <input type="checkbox" aria-label="Agree" />
          <button type="submit">Save</button>
        </form>
      `;

      const snap = takeSnapshot();
      // All interactive elements should have refs
      expect(snap.text).toContain('@e1');
      expect(snap.text).toContain('@e2');
      expect(snap.text).toContain('@e3');
      expect(snap.text).toContain('@e4');
      expect(snap.text).toContain('@e5');
      expect(snap.text).toContain('@e6');

      // Type into text and email
      typeText('@e1', 'John');
      typeText('@e2', 'john@example.com');
      typeText('@e3', 'A developer');
      selectOption('@e4', 'admin');

      // Re-snapshot should reflect values
      const snap2 = takeSnapshot();
      expect(snap2.text).toContain('John');
      expect(snap2.text).toContain('john@example.com');
      expect(snap2.text).toContain('A developer');
      expect(snap2.text).toContain('Admin');
    });
  });
});
