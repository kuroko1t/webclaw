import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { takeSnapshot, resolveRef } from '../content/snapshot-engine';
import {
  typeText,
  tokenizeKeys,
  isChipInput,
  findFileInputForDrop,
  fileMatchesAccept,
  dropFiles,
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

const PNG = { name: 'a.png', mimeType: 'image/png' };

describe('findFileInputForDrop', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns null when the page has no file input', () => {
    document.body.innerHTML = '<button id="b">Upload</button>';
    expect(findFileInputForDrop(document.getElementById('b')!, [PNG])).toBeNull();
  });

  it('prefers the file input sharing the closest ancestor', () => {
    document.body.innerHTML = `
      <section>
        <div><input type="file" id="far"></div>
        <div id="picker"><button id="b">Select files</button><input type="file" id="near" hidden></div>
      </section>`;
    expect(findFileInputForDrop(document.getElementById('b')!, [PNG])!.id).toBe('near');
  });

  it('ignores an unrelated file input far away in the page', () => {
    document.body.innerHTML = `
      <header><div><div><input type="file" id="avatar"></div></div></header>
      <main><div><div><div><div><div><div id="zone">Drop files here</div></div></div></div></div></div></main>`;
    expect(findFileInputForDrop(document.getElementById('zone')!, [PNG])).toBeNull();
  });

  it('uses a file input anywhere in the same form or dialog', () => {
    document.body.innerHTML = `
      <input type="file" id="outside">
      <div role="dialog">
        <div><div><div><div><div><div><button id="b">Select</button></div></div></div></div></div></div>
        <input type="file" id="inside">
      </div>`;
    expect(findFileInputForDrop(document.getElementById('b')!, [PNG])!.id).toBe('inside');
  });

  it('does not look outside the nearest form', () => {
    document.body.innerHTML = `
      <div><input type="file" id="sibling"><form><button id="b">Upload</button></form></div>`;
    expect(findFileInputForDrop(document.getElementById('b')!, [PNG])).toBeNull();
  });

  it('finds file inputs inside shadow roots', () => {
    const host = document.createElement('upload-dialog');
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<div id="drop">Drop here</div><input type="file" id="inner">';
    const drop = root.getElementById('drop')!;
    expect(findFileInputForDrop(drop, [PNG])!.id).toBe('inner');
  });

  it('finds the file input in the shadow root of the search root', () => {
    document.body.innerHTML = '<div id="wrap"><upload-box id="box"></upload-box><button id="b">Upload</button></div>';
    const root = document.getElementById('box')!.attachShadow({ mode: 'open' });
    root.innerHTML = '<input type="file" id="inner">';
    expect(findFileInputForDrop(document.getElementById('b')!, [PNG])!.id).toBe('inner');
  });

  it('skips disabled inputs, including inside a disabled fieldset', () => {
    document.body.innerHTML = `
      <div><button id="b">x</button>
        <input type="file" id="dis" disabled>
        <fieldset disabled><input type="file" id="fs"></fieldset>
        <input type="file" id="ok">
      </div>`;
    expect(findFileInputForDrop(document.getElementById('b')!, [PNG])!.id).toBe('ok');
  });

  it('skips inputs whose accept list rejects the file', () => {
    document.body.innerHTML = `
      <div><button id="b">x</button>
        <input type="file" id="video" accept="video/*">
        <input type="file" id="image" accept=".jpg, image/*">
      </div>`;
    const b = document.getElementById('b')!;
    expect(findFileInputForDrop(b, [PNG])!.id).toBe('image');
    expect(findFileInputForDrop(b, [{ name: 'clip.mp4', mimeType: 'video/mp4' }])!.id).toBe('video');
    expect(findFileInputForDrop(b, [{ name: 'doc.pdf', mimeType: 'application/pdf' }])).toBeNull();
  });

  it('skips inputs without multiple when several files are dropped', () => {
    document.body.innerHTML = `
      <div><button id="b">x</button><input type="file" id="single"><input type="file" id="multi" multiple></div>`;
    const b = document.getElementById('b')!;
    expect(findFileInputForDrop(b, [PNG, PNG])!.id).toBe('multi');
    document.getElementById('multi')!.remove();
    expect(findFileInputForDrop(b, [PNG, PNG])).toBeNull();
  });
});

describe('fileMatchesAccept', () => {
  it('matches extensions, wildcards and exact types case-insensitively', () => {
    expect(fileMatchesAccept('', PNG)).toBe(true);
    expect(fileMatchesAccept('.PNG', PNG)).toBe(true);
    expect(fileMatchesAccept('image/*', PNG)).toBe(true);
    expect(fileMatchesAccept('image/png', PNG)).toBe(true);
    expect(fileMatchesAccept('image/jpeg,.gif', PNG)).toBe(false);
  });
});

describe('dropFiles', () => {
  const filesByInput = new WeakMap<HTMLInputElement, unknown>();
  const originalFiles = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files')!;

  beforeAll(() => {
    // jsdom has no DataTransfer/DragEvent and only accepts a real FileList
    class FakeDataTransfer {
      private list: File[] = [];
      items = { add: (f: File) => this.list.push(f) };
      get files() {
        return this.list;
      }
    }
    class FakeDragEvent extends Event {
      dataTransfer: unknown;
      constructor(type: string, init?: EventInit & { dataTransfer?: unknown }) {
        super(type, init);
        this.dataTransfer = init?.dataTransfer;
      }
    }
    vi.stubGlobal('DataTransfer', FakeDataTransfer);
    vi.stubGlobal('DragEvent', FakeDragEvent);
    Object.defineProperty(HTMLInputElement.prototype, 'files', {
      configurable: true,
      get(this: HTMLInputElement) {
        return filesByInput.get(this) ?? null;
      },
      set(this: HTMLInputElement, v: unknown) {
        filesByInput.set(this, v);
      },
    });
  });

  afterAll(() => {
    Object.defineProperty(HTMLInputElement.prototype, 'files', originalFiles);
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  const file = { name: 'a.png', mimeType: 'image/png', base64Data: btoa('png') };

  function refOf(el: Element): string {
    takeSnapshot();
    for (let i = 1; i < 50; i++) {
      if (resolveRef(`@e${i}`) === el) return `@e${i}`;
    }
    throw new Error('element has no ref');
  }

  it('falls back to drag-and-drop when only an unrelated file input exists', () => {
    document.body.innerHTML = `
      <header><div><div><input type="file" id="avatar"></div></div></header>
      <main><div><div><div><div><div><div><button id="zone">Drop files here</button></div></div></div></div></div></div></main>`;
    const zone = document.getElementById('zone')!;
    const events: string[] = [];
    for (const t of ['dragenter', 'dragover', 'drop']) zone.addEventListener(t, () => events.push(t));
    const avatarChange = vi.fn();
    document.getElementById('avatar')!.addEventListener('change', avatarChange);

    const result = dropFiles(refOf(zone), [file]);
    expect(result).toEqual({ success: true, method: 'drag-and-drop' });
    expect(events).toEqual(['dragenter', 'dragover', 'drop']);
    expect(avatarChange).not.toHaveBeenCalled();
  });

  it('sets the files of a file input in the same dialog', () => {
    document.body.innerHTML = `
      <div role="dialog"><button id="b">Select files</button><input type="file" id="f" accept="image/*" hidden></div>`;
    const input = document.getElementById('f') as HTMLInputElement;
    const change = vi.fn();
    input.addEventListener('change', change);

    const result = dropFiles(refOf(document.getElementById('b')!), [file]);
    expect(result).toEqual({ success: true, method: 'nearest-file-input' });
    expect(change).toHaveBeenCalledTimes(1);
    expect((input.files as unknown as File[])[0].name).toBe('a.png');
  });

  it('falls back to drag-and-drop when the nearby input does not accept the file', () => {
    document.body.innerHTML = `
      <form><button id="b">Upload video</button><input type="file" accept="video/*"></form>`;
    const result = dropFiles(refOf(document.getElementById('b')!), [file]);
    expect(result.method).toBe('drag-and-drop');
  });
});
