import { describe, it, expect, beforeEach } from 'vitest';
import { takeSnapshot } from '../content/snapshot-engine';
import {
  typeText,
  tokenizeKeys,
  isChipInput,
  findNearestFileInput,
} from '../content/action-executor';

describe('tokenizeKeys', () => {
  it('keeps plain text as a single run', () => {
    expect(tokenizeKeys('hello, world', false)).toEqual([{ kind: 'text', text: 'hello, world' }]);
  });

  it('splits newline and tab into key presses', () => {
    expect(tokenizeKeys('a\nb\tc\r\n', false)).toEqual([
      { kind: 'text', text: 'a' },
      { kind: 'key', key: 'Enter' },
      { kind: 'text', text: 'b' },
      { kind: 'key', key: 'Tab' },
      { kind: 'text', text: 'c' },
      { kind: 'key', key: 'Enter' },
    ]);
  });

  it('treats commas as keys only when requested', () => {
    expect(tokenizeKeys('tag1,tag2,', true)).toEqual([
      { kind: 'text', text: 'tag1' },
      { kind: 'key', key: ',' },
      { kind: 'text', text: 'tag2' },
      { kind: 'key', key: ',' },
    ]);
  });
});

describe('isChipInput', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('detects inputs inside a chip bar', () => {
    document.body.innerHTML =
      '<ytcp-free-text-chip-bar><div><input id="t"></div></ytcp-free-text-chip-bar><input id="plain">';
    expect(isChipInput(document.getElementById('t')!)).toBe(true);
    expect(isChipInput(document.getElementById('plain')!)).toBe(false);
  });

  it('matches common chip class names but not words that contain "chip"', () => {
    document.body.innerHTML = `
      <div class="MuiChip-root"><input id="mui"></div>
      <div class="mat-chip-grid"><input id="mat"></div>
      <div class="ChipInput"><input id="camel"></div>
      <div class="microchip-specs"><input id="micro"></div>
      <div class="chipset-list"><input id="chipset"></div>`;
    const ids = ['mui', 'mat', 'camel', 'micro', 'chipset'];
    expect(ids.map((id) => isChipInput(document.getElementById(id)!))).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
  });

  it('detects chip containers across shadow roots', () => {
    const host = document.createElement('div');
    host.className = 'tags-editor';
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: 'open' });
    const input = document.createElement('input');
    root.appendChild(input);
    expect(isChipInput(input)).toBe(true);
  });
});

describe('typeText key handling', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps value-based typing for plain text', () => {
    document.body.innerHTML = '<input type="text" id="i">';
    takeSnapshot();
    const result = typeText('@e1', 'a, b');
    expect(result).toEqual({ success: true });
    expect((document.getElementById('i') as HTMLInputElement).value).toBe('a, b');
  });

  it('inserts newlines and tabs as text without pressKeys', () => {
    document.body.innerHTML = '<textarea id="t">old</textarea>';
    takeSnapshot();
    const result = typeText('@e1', 'line1\nline2\tend');
    expect(result).toEqual({ success: true });
    expect((document.getElementById('t') as HTMLTextAreaElement).value).toBe('line1\nline2\tend');
  });

  it('does not treat commas on chip inputs as keys without pressKeys', () => {
    document.body.innerHTML = '<div class="chip-bar"><input type="text" id="i"></div>';
    takeSnapshot();
    const result = typeText('@e1', 'a,b');
    expect(result).toEqual({ success: true });
    expect((document.getElementById('i') as HTMLInputElement).value).toBe('a,b');
  });

  it('requests trusted input for text with a newline', () => {
    document.body.innerHTML = '<input type="text" id="i" value="old">';
    takeSnapshot();
    const result = typeText('@e1', 'x\n', true, { pressKeys: true });
    expect(result.success).toBe(true);
    expect(result.needsTrustedInput).toBe(true);
    expect(result.commaAsKey).toBe(false);
  });

  it('requests trusted input with comma keys for chip inputs', () => {
    document.body.innerHTML = '<div class="chip-bar"><input type="text" id="i"></div>';
    takeSnapshot();
    const result = typeText('@e1', 'tag,', true, { pressKeys: true });
    expect(result.needsTrustedInput).toBe(true);
    expect(result.commaAsKey).toBe(true);
  });

  it('synthetic mode dispatches key events and keeps the text', () => {
    document.body.innerHTML = '<div class="chip-bar"><input type="text" id="i"></div>';
    const input = document.getElementById('i') as HTMLInputElement;
    const keys: string[] = [];
    const chips: string[] = [];
    input.addEventListener('keydown', (e) => {
      keys.push(e.key);
      if (e.key === ',' || e.key === 'Enter') {
        e.preventDefault();
        chips.push(input.value);
        input.value = '';
      }
    });
    takeSnapshot();
    const result = typeText('@e1', 'a,b\n', true, { pressKeys: true, mode: 'synthetic' });
    expect(result.success).toBe(true);
    expect(keys).toEqual([',', 'Enter']);
    expect(chips).toEqual(['a', 'b']);
  });
});

describe('typeText field preparation for trusted input', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('does not throw for email inputs with clearFirst=false', () => {
    document.body.innerHTML = '<input type="email" id="e" value="a@b.c">';
    takeSnapshot();
    const result = typeText('@e1', 'x\n', false, { pressKeys: true });
    expect(result).toMatchObject({ success: true, needsTrustedInput: true });
    expect((document.getElementById('e') as HTMLInputElement).value).toBe('a@b.c');
  });

  it('clears number inputs that have no selection API when clearFirst=true', () => {
    document.body.innerHTML = '<input type="number" id="n" value="12">';
    takeSnapshot();
    const result = typeText('@e1', '3\n', true, { pressKeys: true });
    expect(result).toMatchObject({ success: true, needsTrustedInput: true });
    expect((document.getElementById('n') as HTMLInputElement).value).toBe('');
  });

  it('selects existing text of text inputs when clearFirst=true', () => {
    document.body.innerHTML = '<input type="text" id="i" value="old">';
    takeSnapshot();
    typeText('@e1', 'new\n', true, { pressKeys: true });
    const input = document.getElementById('i') as HTMLInputElement;
    expect(input.value).toBe('old');
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 3]);
  });
});

describe('findNearestFileInput', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns null when the page has no file input', () => {
    document.body.innerHTML = '<button id="b">Upload</button>';
    expect(findNearestFileInput(document.getElementById('b')!)).toBeNull();
  });

  it('prefers the file input sharing the closest ancestor', () => {
    document.body.innerHTML = `
      <div><input type="file" id="far"></div>
      <section>
        <div id="picker"><button id="b">Select files</button><input type="file" id="near" hidden></div>
      </section>`;
    expect(findNearestFileInput(document.getElementById('b')!)!.id).toBe('near');
  });

  it('finds file inputs inside shadow roots', () => {
    const host = document.createElement('upload-dialog');
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<div id="drop">Drop here</div><input type="file" id="inner">';
    const drop = root.getElementById('drop')!;
    expect(findNearestFileInput(drop)!.id).toBe('inner');
  });

  it('skips disabled file inputs', () => {
    document.body.innerHTML =
      '<div><button id="b">x</button><input type="file" id="dis" disabled></div><input type="file" id="ok">';
    expect(findNearestFileInput(document.getElementById('b')!)!.id).toBe('ok');
  });
});
