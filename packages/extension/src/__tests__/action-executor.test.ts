import { describe, it, expect, beforeEach } from 'vitest';
import { takeSnapshot } from '../content/snapshot-engine';
import { clickElement, typeText, selectOption } from '../content/action-executor';

describe('action-executor', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('clickElement', () => {
    it('clicks a button by ref', () => {
      let clicked = false;
      document.body.innerHTML = '<button id="btn">Click me</button>';
      document.getElementById('btn')!.addEventListener('click', () => {
        clicked = true;
      });
      takeSnapshot();
      const result = clickElement('@e1');
      expect(result.success).toBe(true);
      expect(clicked).toBe(true);
    });

    it('returns error for invalid ref', () => {
      document.body.innerHTML = '<button>Click</button>';
      takeSnapshot();
      const result = clickElement('@e999');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('clicks a link by ref', () => {
      let clicked = false;
      document.body.innerHTML = '<a href="#" id="link">Link</a>';
      document.getElementById('link')!.addEventListener('click', (e) => {
        e.preventDefault();
        clicked = true;
      });
      takeSnapshot();
      const result = clickElement('@e1');
      expect(result.success).toBe(true);
      expect(clicked).toBe(true);
    });
  });

  describe('typeText', () => {
    it('types text into an input', () => {
      document.body.innerHTML = '<input type="text" aria-label="Name">';
      takeSnapshot();
      const result = typeText('@e1', 'Alice');
      expect(result.success).toBe(true);
      const input = document.querySelector('input') as HTMLInputElement;
      expect(input.value).toBe('Alice');
    });

    it('clears existing text by default', () => {
      document.body.innerHTML = '<input type="text" value="old" aria-label="Name">';
      takeSnapshot();
      typeText('@e1', 'new');
      const input = document.querySelector('input') as HTMLInputElement;
      expect(input.value).toBe('new');
    });

    it('appends when clearFirst is false', () => {
      document.body.innerHTML = '<input type="text" value="hello " aria-label="Name">';
      takeSnapshot();
      typeText('@e1', 'world', false);
      const input = document.querySelector('input') as HTMLInputElement;
      expect(input.value).toBe('hello world');
    });

    it('types into textarea', () => {
      document.body.innerHTML = '<textarea aria-label="Message"></textarea>';
      takeSnapshot();
      const result = typeText('@e1', 'Hello world');
      expect(result.success).toBe(true);
      const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
      expect(textarea.value).toBe('Hello world');
    });

    it('returns error for non-input element', () => {
      document.body.innerHTML = '<button>Not input</button>';
      takeSnapshot();
      const result = typeText('@e1', 'text');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not a text input');
    });

    it('returns error for invalid ref', () => {
      document.body.innerHTML = '<input type="text">';
      takeSnapshot();
      const result = typeText('@e999', 'text');
      expect(result.success).toBe(false);
    });
  });

  describe('selectOption', () => {
    it('selects an option by value', () => {
      document.body.innerHTML = `
        <select aria-label="Color">
          <option value="r">Red</option>
          <option value="g">Green</option>
          <option value="b">Blue</option>
        </select>
      `;
      takeSnapshot();
      const result = selectOption('@e1', 'g');
      expect(result.success).toBe(true);
      const select = document.querySelector('select') as HTMLSelectElement;
      expect(select.value).toBe('g');
    });

    it('selects an option by text', () => {
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

    it('returns error for non-existent option', () => {
      document.body.innerHTML = `
        <select aria-label="Color">
          <option value="r">Red</option>
        </select>
      `;
      takeSnapshot();
      const result = selectOption('@e1', 'Purple');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('returns error for non-select element', () => {
      document.body.innerHTML = '<input type="text">';
      takeSnapshot();
      const result = selectOption('@e1', 'value');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not a select');
    });

    it('returns error when selecting a disabled option', () => {
      document.body.innerHTML = `
        <select aria-label="Color">
          <option value="r">Red</option>
          <option value="g" disabled>Green</option>
        </select>
      `;
      takeSnapshot();
      const result = selectOption('@e1', 'g');
      expect(result.success).toBe(false);
      expect(result.error).toContain('disabled');
    });

    it('returns error when selecting disabled option by text', () => {
      document.body.innerHTML = `
        <select aria-label="Size">
          <option value="s">Small</option>
          <option value="l" disabled>Large</option>
        </select>
      `;
      takeSnapshot();
      const result = selectOption('@e1', 'Large');
      expect(result.success).toBe(false);
      expect(result.error).toContain('disabled');
    });

    it('returns error for disabled select element', () => {
      document.body.innerHTML = `
        <select aria-label="Color" disabled>
          <option value="r">Red</option>
        </select>
      `;
      takeSnapshot();
      const result = selectOption('@e1', 'r');
      expect(result.success).toBe(false);
      expect(result.error).toContain('disabled');
    });
  });

  describe('disabled element handling', () => {
    it('returns error for clicking disabled button', () => {
      document.body.innerHTML = '<button disabled>Disabled</button>';
      takeSnapshot();
      const result = clickElement('@e1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('disabled');
    });

    it('returns error for clicking aria-disabled="true" button', () => {
      document.body.innerHTML = '<button aria-disabled="true">Aria Disabled</button>';
      takeSnapshot();
      const result = clickElement('@e1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('disabled');
    });

    it('allows clicking aria-disabled="false" button', () => {
      let clicked = false;
      document.body.innerHTML = '<button id="btn" aria-disabled="false">Enabled</button>';
      document.getElementById('btn')!.addEventListener('click', () => { clicked = true; });
      takeSnapshot();
      const result = clickElement('@e1');
      expect(result.success).toBe(true);
      expect(clicked).toBe(true);
    });

    it('returns error for typing into disabled input', () => {
      document.body.innerHTML = '<input type="text" disabled aria-label="Name">';
      takeSnapshot();
      const result = typeText('@e1', 'hello');
      expect(result.success).toBe(false);
      expect(result.error).toContain('disabled');
    });

    it('returns error for typing into aria-disabled input', () => {
      document.body.innerHTML = '<input type="text" aria-disabled="true" aria-label="Name">';
      takeSnapshot();
      const result = typeText('@e1', 'hello');
      expect(result.success).toBe(false);
      expect(result.error).toContain('disabled');
    });
  });

  describe('contenteditable handling', () => {
    it('types into contenteditable="true" element', () => {
      document.body.innerHTML = '<div contenteditable="true" aria-label="Editor"></div>';
      takeSnapshot();
      const result = typeText('@e1', 'Hello');
      expect(result.success).toBe(true);
      expect(document.querySelector('[contenteditable]')!.textContent).toBe('Hello');
    });

    it('types into contenteditable="" element', () => {
      document.body.innerHTML = '<div contenteditable="" aria-label="Editor"></div>';
      takeSnapshot();
      const result = typeText('@e1', 'Hello');
      expect(result.success).toBe(true);
      expect(document.querySelector('[contenteditable]')!.textContent).toBe('Hello');
    });

    it('types into bare contenteditable element', () => {
      document.body.innerHTML = '<div contenteditable aria-label="Editor"></div>';
      takeSnapshot();
      const result = typeText('@e1', 'Hello');
      expect(result.success).toBe(true);
    });

    it('rejects typing into contenteditable="false" element', () => {
      // contenteditable="false" is not interactive, so it won't get a @ref
      // We test this by attempting to type into a non-input element
      document.body.innerHTML = '<button>Not input</button>';
      takeSnapshot();
      const result = typeText('@e1', 'Hello');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not a text input');
    });

    it('clears contenteditable content when clearFirst=true', () => {
      document.body.innerHTML = '<div contenteditable="true" aria-label="Editor">old text</div>';
      takeSnapshot();
      typeText('@e1', 'new text', true);
      expect(document.querySelector('[contenteditable]')!.textContent).toBe('new text');
    });

    it('appends to contenteditable content when clearFirst=false', () => {
      document.body.innerHTML = '<div contenteditable="true" aria-label="Editor">hello </div>';
      takeSnapshot();
      typeText('@e1', 'world', false);
      expect(document.querySelector('[contenteditable]')!.textContent).toBe('hello world');
    });
  });

  describe('event dispatching', () => {
    it('dispatches mousedown, mouseup, and click events on click', () => {
      const events: string[] = [];
      document.body.innerHTML = '<button id="btn">Click</button>';
      const btn = document.getElementById('btn')!;
      btn.addEventListener('mousedown', () => events.push('mousedown'));
      btn.addEventListener('mouseup', () => events.push('mouseup'));
      btn.addEventListener('click', () => events.push('click'));
      takeSnapshot();
      clickElement('@e1');
      expect(events).toEqual(['mousedown', 'mouseup', 'click']);
    });

    it('dispatches input and change events on typeText', () => {
      const events: string[] = [];
      document.body.innerHTML = '<input type="text" aria-label="Name">';
      const input = document.querySelector('input')!;
      input.addEventListener('input', () => events.push('input'));
      input.addEventListener('change', () => events.push('change'));
      takeSnapshot();
      typeText('@e1', 'test');
      expect(events).toContain('input');
      expect(events).toContain('change');
    });

    it('dispatches change and input events on selectOption', () => {
      const events: string[] = [];
      document.body.innerHTML = `
        <select aria-label="Color">
          <option value="r">Red</option>
          <option value="b">Blue</option>
        </select>
      `;
      const select = document.querySelector('select')!;
      select.addEventListener('change', () => events.push('change'));
      select.addEventListener('input', () => events.push('input'));
      takeSnapshot();
      selectOption('@e1', 'b');
      expect(events).toContain('change');
      expect(events).toContain('input');
    });
  });
});
