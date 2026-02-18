import { describe, it, expect } from 'vitest';
import { formatSnapshot, estimateTokens } from '../snapshot-formatter.js';
import type { SnapshotNode } from '../types/snapshot.js';

describe('formatSnapshot', () => {
  it('formats a simple node', () => {
    const node: SnapshotNode = { role: 'page', name: 'Test Page' };
    expect(formatSnapshot(node)).toBe('[page "Test Page"]');
  });

  it('formats a node with ref', () => {
    const node: SnapshotNode = { role: 'button', ref: '@e1', name: 'Submit' };
    expect(formatSnapshot(node)).toBe('[@e1 button "Submit"]');
  });

  it('formats a node with value', () => {
    const node: SnapshotNode = { role: 'textbox', ref: '@e2', name: 'Email', value: 'test@test.com' };
    expect(formatSnapshot(node)).toBe('[@e2 textbox "Email"] test@test.com');
  });

  it('formats checked state', () => {
    const node: SnapshotNode = { role: 'checkbox', ref: '@e3', checked: true };
    expect(formatSnapshot(node)).toBe('[@e3 checkbox] (checked)');
  });

  it('formats unchecked state', () => {
    const node: SnapshotNode = { role: 'checkbox', ref: '@e3', checked: false };
    expect(formatSnapshot(node)).toBe('[@e3 checkbox] (unchecked)');
  });

  it('formats disabled state', () => {
    const node: SnapshotNode = { role: 'button', ref: '@e4', name: 'Disabled', disabled: true };
    expect(formatSnapshot(node)).toBe('[@e4 button "Disabled"] (disabled)');
  });

  it('formats nested tree', () => {
    const tree: SnapshotNode = {
      role: 'page',
      name: 'Test',
      children: [
        {
          role: 'nav',
          children: [
            { role: 'link', ref: '@e1', name: 'Home' },
            { role: 'link', ref: '@e2', name: 'About' },
          ],
        },
        {
          role: 'main',
          children: [
            { role: 'button', ref: '@e3', name: 'Click me' },
          ],
        },
      ],
    };

    const result = formatSnapshot(tree);
    const lines = result.split('\n');
    expect(lines[0]).toBe('[page "Test"]');
    expect(lines[1]).toBe('  [nav]');
    expect(lines[2]).toBe('    [@e1 link "Home"]');
    expect(lines[3]).toBe('    [@e2 link "About"]');
    expect(lines[4]).toBe('  [main]');
    expect(lines[5]).toBe('    [@e3 button "Click me"]');
  });
});

describe('estimateTokens', () => {
  it('estimates tokens for short text', () => {
    expect(estimateTokens('hello')).toBe(2); // ceil(5/4) = 2
  });

  it('estimates tokens for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('estimates tokens for longer text', () => {
    const text = 'a'.repeat(100);
    expect(estimateTokens(text)).toBe(25); // 100/4
  });

  it('rounds up', () => {
    expect(estimateTokens('abc')).toBe(1); // ceil(3/4) = 1
  });
});
