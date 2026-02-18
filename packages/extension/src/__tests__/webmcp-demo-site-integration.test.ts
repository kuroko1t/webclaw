/**
 * Demo site integration tests.
 *
 * Loads the actual WebMCP demo site HTML into jsdom and tests:
 * - Snapshot structure
 * - Auto-synthesis tool discovery
 * - Full interaction flow (type → click → verify DOM changes)
 *
 * Note: The <script type="module"> in the HTML is NOT executed by jsdom,
 * so we manually set up the initial DOM state the script would create.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { takeSnapshot, resolveRef } from '../content/snapshot-engine';
import { clickElement, typeText } from '../content/action-executor';
import { discoverWebMCPTools } from '../content/webmcp-discovery';

const __dirname = dirname(fileURLToPath(import.meta.url));
const demoHtmlPath = resolve(__dirname, '../../../../examples/webmcp-demo-site/index.html');

/**
 * Extract the static HTML portion of the demo site (without <script>),
 * then manually add the rendered todo list items as the script would.
 */
function loadDemoSiteDOM(): void {
  const rawHtml = readFileSync(demoHtmlPath, 'utf-8');

  // Strip <script> tags since jsdom doesn't execute module scripts
  const htmlWithoutScript = rawHtml.replace(/<script[\s\S]*?<\/script>/gi, '');

  document.documentElement.innerHTML = htmlWithoutScript
    .replace(/^<!DOCTYPE[^>]*>/i, '')
    .replace(/<html[^>]*>/i, '')
    .replace(/<\/html>/i, '');

  document.title = 'WebMCP Todo App - Demo';

  // Simulate the initial render() from the script
  const todoList = document.getElementById('todoList');
  if (todoList) {
    todoList.innerHTML = `
      <li class="todo-item" data-id="1">
        <input type="checkbox" aria-label="Toggle Learn about WebMCP">
        <span class="todo-text">Learn about WebMCP</span>
        <button class="todo-delete" aria-label="Delete Learn about WebMCP">&times;</button>
      </li>
      <li class="todo-item" data-id="2">
        <input type="checkbox" aria-label="Toggle Build a browser agent">
        <span class="todo-text">Build a browser agent</span>
        <button class="todo-delete" aria-label="Delete Build a browser agent">&times;</button>
      </li>
      <li class="todo-item" data-id="3">
        <input type="checkbox" aria-label="Toggle Take over the world">
        <span class="todo-text">Take over the world</span>
        <button class="todo-delete" aria-label="Delete Take over the world">&times;</button>
      </li>
    `;
  }
}

describe('Demo site integration', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    loadDemoSiteDOM();
  });

  describe('snapshot structure', () => {
    it('snapshot contains the page heading', () => {
      const snap = takeSnapshot();
      expect(snap.text).toContain('heading');
      expect(snap.title).toBe('WebMCP Todo App - Demo');
    });

    it('snapshot contains the input textbox', () => {
      const snap = takeSnapshot();
      expect(snap.text).toContain('textbox');
      expect(snap.text).toContain('New todo text');
    });

    it('snapshot contains the Add button', () => {
      const snap = takeSnapshot();
      expect(snap.text).toContain('button');
      expect(snap.text).toContain('Add');
    });

    it('snapshot contains filter buttons (All, Active, Done)', () => {
      const snap = takeSnapshot();
      expect(snap.text).toContain('All');
      expect(snap.text).toContain('Active');
      expect(snap.text).toContain('Done');
    });

    it('snapshot contains todo item checkboxes', () => {
      const snap = takeSnapshot();
      expect(snap.text).toContain('checkbox');
      expect(snap.text).toContain('Toggle Learn about WebMCP');
    });

    it('snapshot contains delete buttons', () => {
      const snap = takeSnapshot();
      expect(snap.text).toContain('Delete Learn about WebMCP');
    });
  });

  describe('auto-synthesis tool discovery', () => {
    it('discovers standalone buttons as synthesized tools', async () => {
      const tools = await discoverWebMCPTools(1);
      const buttonTools = tools.filter((t) => t.source === 'synthesized-button');
      // Add, All, Active, Done buttons + delete buttons for todo items
      expect(buttonTools.length).toBeGreaterThanOrEqual(4);

      const buttonNames = buttonTools.map((t) => t.name);
      expect(buttonNames.some((n) => n.includes('add'))).toBe(true);
      expect(buttonNames.some((n) => n.includes('all'))).toBe(true);
      expect(buttonNames.some((n) => n.includes('active'))).toBe(true);
      expect(buttonNames.some((n) => n.includes('done'))).toBe(true);
    });

    it('all discovered tools have tabId set', async () => {
      const tools = await discoverWebMCPTools(42);
      for (const tool of tools) {
        expect(tool.tabId).toBe(42);
      }
    });
  });

  describe('full interaction flow', () => {
    it('type into input → click Add → new todo appears in DOM', () => {
      // Take initial snapshot
      const snap1 = takeSnapshot();

      // Find the input textbox ref
      const inputRef = findRefByLabel(snap1.text, 'New todo text');
      expect(inputRef).toBeTruthy();

      // Type new todo text
      const typeResult = typeText(inputRef!, 'Buy groceries');
      expect(typeResult.success).toBe(true);

      const input = document.getElementById('newTodo') as HTMLInputElement;
      expect(input.value).toBe('Buy groceries');

      // Find the Add button ref
      const addRef = findRefByLabel(snap1.text, 'Add');
      expect(addRef).toBeTruthy();

      // Simulate what the Add button click handler would do
      // (jsdom doesn't run the event listeners from the original script)
      let addClicked = false;
      document.getElementById('addBtn')!.addEventListener('click', () => {
        addClicked = true;
        // Simulate adding a new todo item
        const todoList = document.getElementById('todoList')!;
        const li = document.createElement('li');
        li.className = 'todo-item';
        li.dataset.id = '4';
        li.innerHTML = `
          <input type="checkbox" aria-label="Toggle Buy groceries">
          <span class="todo-text">Buy groceries</span>
          <button class="todo-delete" aria-label="Delete Buy groceries">&times;</button>
        `;
        todoList.appendChild(li);
        input.value = '';
      });

      clickElement(addRef!);
      expect(addClicked).toBe(true);

      // Re-snapshot should show the new todo
      const snap2 = takeSnapshot();
      expect(snap2.text).toContain('Buy groceries');
    });
  });
});

/**
 * Find a @ref in snapshot text by looking for lines containing a specific label.
 * Returns the @eN ref string or null.
 */
function findRefByLabel(snapshotText: string, label: string): string | null {
  const lines = snapshotText.split('\n');
  for (const line of lines) {
    if (line.includes(label)) {
      const match = line.match(/@e\d+/);
      if (match) return match[0];
    }
  }
  return null;
}
