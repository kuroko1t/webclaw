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
  });
});
