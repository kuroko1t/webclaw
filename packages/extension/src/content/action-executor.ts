/**
 * Action Executor - Performs DOM interactions on @ref-targeted elements.
 * Handles both WebMCP invocation and DOM fallback operations.
 */
import { resolveRef } from './snapshot-engine';
import { PAGE_BRIDGE_CHANNEL } from 'webclaw-shared';
import { tokenizeKeys } from './key-tokens';
export { tokenizeKeys } from './key-tokens';
export type { KeyToken } from './key-tokens';

/** Check if an element is disabled (native :disabled or aria-disabled="true") */
function isElementDisabled(el: HTMLElement): boolean {
  if (el.matches(':disabled')) return true;
  if (el.getAttribute('aria-disabled') === 'true') return true;
  return false;
}

/** Click an element by @ref */
export function clickElement(ref: string): { success: boolean; error?: string } {
  const el = resolveRef(ref);
  if (!el) {
    return { success: false, error: `Element not found for ref ${ref}` };
  }

  // Support both HTMLElement and SVGElement (SVGs with role="button" etc.)
  if (!(el instanceof HTMLElement) && !(el instanceof SVGElement)) {
    return { success: false, error: `Element ${ref} is not a clickable element` };
  }

  if (el instanceof HTMLElement && isElementDisabled(el)) {
    return { success: false, error: `Element ${ref} is disabled` };
  }

  // Check aria-disabled for non-HTML elements (e.g. SVG with role="button")
  if (!(el instanceof HTMLElement) && el.getAttribute('aria-disabled') === 'true') {
    return { success: false, error: `Element ${ref} is disabled` };
  }

  // Scroll into view
  (el as HTMLElement).scrollIntoView?.({ behavior: 'instant', block: 'center' });

  // Get element center coordinates for realistic mouse events
  const rect = el.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;
  const mouseOpts = { bubbles: true, cancelable: true, clientX, clientY };

  // Dispatch click events (focus first, then mouse sequence)
  if ('focus' in el && typeof el.focus === 'function') {
    el.focus();
    el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
  }
  el.dispatchEvent(new MouseEvent('mousedown', mouseOpts));
  el.dispatchEvent(new MouseEvent('mouseup', mouseOpts));
  el.dispatchEvent(new MouseEvent('click', mouseOpts));

  return { success: true };
}

/** Hover over an element by @ref to trigger mouseover/mouseenter events */
export function hoverElement(ref: string): { success: boolean; error?: string } {
  const el = resolveRef(ref);
  if (!el) {
    return { success: false, error: `Element not found for ref ${ref}` };
  }

  if (!(el instanceof HTMLElement) && !(el instanceof SVGElement)) {
    return { success: false, error: `Element ${ref} is not a hoverable element` };
  }

  // Scroll into view
  (el as HTMLElement).scrollIntoView?.({ behavior: 'instant', block: 'center' });

  // Get element center coordinates for realistic mouse events
  const rect = el.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;
  const pointerOpts = { bubbles: true, cancelable: true, clientX, clientY };

  // Dispatch hover event sequence
  el.dispatchEvent(new PointerEvent('pointerover', pointerOpts));
  el.dispatchEvent(new PointerEvent('pointerenter', { ...pointerOpts, bubbles: false }));
  el.dispatchEvent(new MouseEvent('mouseover', pointerOpts));
  el.dispatchEvent(new MouseEvent('mouseenter', { ...pointerOpts, bubbles: false }));
  el.dispatchEvent(new PointerEvent('pointermove', pointerOpts));
  el.dispatchEvent(new MouseEvent('mousemove', pointerOpts));

  return { success: true };
}

/** Parent in the composed tree (crosses shadow root boundaries). */
function composedParent(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

/**
 * "chip"/"chips" as a word or camel-case part (mat-chip-grid, MuiChip-root,
 * ChipInput, ytcp-chip-bar) but not inside another word ("microchip"), or
 * "tag"/"tags" delimited by -, _ or whitespace.
 */
const CHIP_PATTERN = /(?:^|[^a-zA-Z])chips?(?![a-z])|Chips?(?![a-z])|(?:^|[-_\s])[tT]ags?(?:[-_\s]|$)/;

/**
 * Heuristic: is this input part of a chip/tag editor (e.g. YouTube Studio tags,
 * where a comma or Enter commits the typed text as a chip)?
 */
export function isChipInput(el: Element): boolean {
  let cur: Element | null = el;
  for (let depth = 0; cur && depth < 8; depth++) {
    const cls = typeof cur.className === 'string' ? cur.className : '';
    if (
      CHIP_PATTERN.test(cur.tagName.toLowerCase()) ||
      CHIP_PATTERN.test(cur.id) ||
      CHIP_PATTERN.test(cls)
    ) {
      return true;
    }
    cur = composedParent(cur);
  }
  return false;
}

/** Whether type_text needs real key presses for this text/element. */
export function needsKeyPresses(el: Element, text: string): boolean {
  return /[\n\t]/.test(text) || (text.includes(',') && isChipInput(el));
}

const KEY_INFO: Record<'Enter' | 'Tab' | ',', { key: string; code: string; keyCode: number }> = {
  Enter: { key: 'Enter', code: 'Enter', keyCode: 13 },
  Tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
  ',': { key: ',', code: 'Comma', keyCode: 188 },
};

/** Dispatch a synthetic (untrusted) keydown/keypress/keyup sequence. */
function dispatchSyntheticKey(el: Element, k: 'Enter' | 'Tab' | ','): void {
  const info = KEY_INFO[k];
  const opts = {
    key: info.key,
    code: info.code,
    keyCode: info.keyCode,
    which: info.keyCode,
    bubbles: true,
    cancelable: true,
    composed: true,
  };
  const notCanceled = el.dispatchEvent(new KeyboardEvent('keydown', opts));
  if (k !== 'Tab') el.dispatchEvent(new KeyboardEvent('keypress', { ...opts, charCode: info.keyCode }));
  if (notCanceled && k === ',' && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    // Default action of a printable key: insert it
    setNativeValue(el, el.value + ',');
    el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: ',', bubbles: true, composed: true }));
  }
  el.dispatchEvent(new KeyboardEvent('keyup', opts));
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
    'value'
  )?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

export type TypeTextMode = 'auto' | 'synthetic' | 'value';

export interface TypeTextOptions {
  /**
   * Send "\n" / "\t" (and "," on chip inputs) as key presses. When false
   * (the default) the text, including newlines and tabs, is inserted as the
   * value exactly as before key handling existed.
   */
  pressKeys?: boolean;
  /** 'auto' asks the service worker for trusted input; 'synthetic' is its fallback. */
  mode?: TypeTextMode;
}

type TypeTextResult = {
  success: boolean;
  error?: string;
  needsTrustedInput?: boolean;
  commaAsKey?: boolean;
};

/**
 * Type text into an element by @ref.
 *
 * Without `pressKeys` the text is inserted with the value setter (or
 * execCommand for contenteditable) and input/change events, newlines included.
 * With `pressKeys`, when the text contains "\n" / "\t" (or "," on a chip/tag
 * input) and `mode` is 'auto', the element is only focused/cleared and
 * `needsTrustedInput: true` is returned so the service worker can type it with
 * trusted CDP input events. `mode: 'synthetic'` is the fallback when the
 * debugger is unavailable: synthetic KeyboardEvents are dispatched per key.
 */
export function typeText(
  ref: string,
  text: string,
  clearFirst = true,
  options: TypeTextOptions = {}
): TypeTextResult {
  const { pressKeys = false, mode = 'auto' } = options;
  const el = resolveRef(ref);
  if (!el) {
    return { success: false, error: `Element not found for ref ${ref}` };
  }

  const ceAttr = el.getAttribute('contenteditable');
  const isContentEditable = ceAttr !== null && ceAttr !== 'false';

  if (
    !(el instanceof HTMLInputElement) &&
    !(el instanceof HTMLTextAreaElement) &&
    !isContentEditable
  ) {
    return { success: false, error: `Element ${ref} is not a text input` };
  }

  if (el instanceof HTMLElement && isElementDisabled(el)) {
    return { success: false, error: `Element ${ref} is disabled` };
  }

  el.scrollIntoView?.({ behavior: 'instant', block: 'center' });
  (el as HTMLElement).focus();
  el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

  if (pressKeys && mode !== 'value' && needsKeyPresses(el, text)) {
    if (mode === 'auto') {
      // Prepare the field; the service worker types with trusted events.
      prepareForTrustedTyping(el, clearFirst);
      return { success: true, needsTrustedInput: true, commaAsKey: isChipInput(el) };
    }

    // Synthetic fallback
    const tokens = tokenizeKeys(text, isChipInput(el));
    let first = true;
    for (const t of tokens) {
      if (t.kind === 'text') {
        insertPlainText(el, t.text, first && clearFirst, false);
      } else {
        if (first && clearFirst) insertPlainText(el, '', true, false);
        dispatchSyntheticKey(el, t.key);
      }
      first = false;
    }
    return { success: true };
  }

  insertPlainText(el, text, clearFirst);
  return { success: true };
}

/**
 * Select the field's content (clearFirst) or move the caret to the end so
 * that trusted typing replaces or appends to it.
 */
function prepareForTrustedTyping(el: Element, clearFirst: boolean): void {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (clearFirst) {
      el.select();
      if (el.selectionStart === null) {
        // Types without a selection API (email, number): clear the value so
        // the typed text does not get appended to it.
        setNativeValue(el, '');
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } else {
      try {
        const end = el.value.length;
        el.setSelectionRange(end, end);
      } catch {
        // email/number inputs throw InvalidStateError; keep the caret as is
      }
    }
    return;
  }
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(el);
  if (!clearFirst) range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/**
 * Original value-based text insertion (input/textarea/contenteditable).
 * `insertEmpty=false` skips the insert step for an empty string (used when
 * the synthetic key path only needs the field cleared).
 */
function insertPlainText(
  el: Element,
  text: string,
  clearFirst: boolean,
  insertEmpty = true
): void {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (clearFirst) {
      el.value = '';
    }

    // Use native input setter for React/Vue compatibility
    setNativeValue(el, clearFirst ? text : el.value + text);

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    // contenteditable — use multiple strategies for rich-text editor compatibility
    // (Prosemirror, Draft.js, Slate, etc.)
    if (clearFirst) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      selection?.removeAllRanges();
      selection?.addRange(range);
      if (typeof document.execCommand === 'function') {
        document.execCommand('delete');
      } else {
        el.textContent = '';
      }
    } else {
      // Place cursor at end
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    if (!text && !insertEmpty) return;
    // Try execCommand first (works with most editors)
    let inserted = false;
    if (typeof document.execCommand === 'function') {
      inserted = document.execCommand('insertText', false, text);
    }
    // Fallback: dispatch InputEvent with insertText type (Prosemirror, modern editors)
    if (!inserted) {
      el.dispatchEvent(new InputEvent('beforeinput', {
        inputType: 'insertText',
        data: text,
        bubbles: true,
        cancelable: true,
        composed: true,
      }));
      // If editor didn't handle beforeinput, set textContent directly
      if (!el.textContent?.includes(text)) {
        el.textContent = (clearFirst ? '' : (el.textContent ?? '')) + text;
      }
      el.dispatchEvent(new InputEvent('input', {
        inputType: 'insertText',
        data: text,
        bubbles: true,
      }));
    }
  }
}

/** Select an option by @ref and value */
export function selectOption(
  ref: string,
  value: string
): { success: boolean; error?: string } {
  const el = resolveRef(ref);
  if (!el) {
    return { success: false, error: `Element not found for ref ${ref}` };
  }

  if (!(el instanceof HTMLSelectElement)) {
    return { success: false, error: `Element ${ref} is not a select element` };
  }

  if (isElementDisabled(el)) {
    return { success: false, error: `Element ${ref} is disabled` };
  }

  el.scrollIntoView?.({ behavior: 'instant', block: 'center' });
  el.focus();

  // Find option by value or text
  let found = false;
  for (const option of el.options) {
    if (option.value === value || option.textContent?.trim() === value) {
      // Check option's own disabled state and parent optgroup's disabled state
      const optgroupDisabled =
        option.parentElement instanceof HTMLOptGroupElement &&
        option.parentElement.disabled;
      if (option.disabled || optgroupDisabled) {
        return {
          success: false,
          error: `Option "${value}" is disabled in select ${ref}`,
        };
      }
      // For select[multiple], use option.selected to preserve existing selections.
      // For single select, el.value is sufficient and deselects others as expected.
      if (el.multiple) {
        option.selected = true;
      } else {
        el.value = option.value;
      }
      found = true;
      break;
    }
  }

  if (!found) {
    return {
      success: false,
      error: `Option "${value}" not found in select ${ref}`,
    };
  }

  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('input', { bubbles: true }));

  return { success: true };
}

/** Convert base64 string to a File object */
function base64ToFile(name: string, mimeType: string, base64Data: string): File {
  const byteString = atob(base64Data);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new File([ab], name, { type: mimeType });
}

/** Collect all <input type="file"> in a root, descending into open shadow roots. */
function collectFileInputs(root: ParentNode, out: HTMLInputElement[] = []): HTMLInputElement[] {
  for (const node of root.querySelectorAll('*')) {
    if (node instanceof HTMLInputElement && node.type === 'file') out.push(node);
    if (node.shadowRoot) collectFileInputs(node.shadowRoot, out);
  }
  return out;
}

/** Composed ancestor chain of an element, starting with the element itself. */
function composedAncestors(el: Element): Element[] {
  const chain: Element[] = [];
  for (let cur: Element | null = el; cur; cur = composedParent(cur)) chain.push(cur);
  return chain;
}

/**
 * How many composed ancestors above the ref drop_files searches for a file
 * input when the ref is not inside a form or dialog.
 */
export const FILE_INPUT_SEARCH_DEPTH = 5;

const DROP_CONTAINER_SELECTOR = 'form, dialog, [role="dialog"]';

/**
 * The subtree in which drop_files looks for a file input: the nearest
 * composed ancestor that is a form or dialog, otherwise the ancestor
 * FILE_INPUT_SEARCH_DEPTH levels up.
 */
export function fileInputSearchRoot(el: Element): Element {
  for (let cur: Element | null = el; cur; cur = composedParent(cur)) {
    if (cur.matches(DROP_CONTAINER_SELECTOR)) return cur;
  }
  let root = el;
  for (let i = 0; i < FILE_INPUT_SEARCH_DEPTH; i++) {
    const parent = composedParent(root);
    if (!parent) break;
    root = parent;
  }
  return root;
}

/** Whether a file satisfies an <input accept> list (".ext", "type/*", "type/subtype"). */
export function fileMatchesAccept(accept: string, file: { name: string; mimeType: string }): boolean {
  const tokens = accept
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const name = file.name.toLowerCase();
  const mime = file.mimeType.toLowerCase();
  return tokens.some((t) => {
    if (t.startsWith('.')) return name.endsWith(t);
    if (t.endsWith('/*')) return mime.startsWith(t.slice(0, -1));
    return mime === t;
  });
}

/**
 * Find the <input type="file"> to receive files dropped on `el` (an upload
 * button or drop zone). Only inputs in the same form/dialog (or within
 * FILE_INPUT_SEARCH_DEPTH ancestors) are considered, including inputs in
 * open shadow roots. Inputs that are disabled (also via a disabled
 * fieldset), whose accept list rejects one of the files, or that lack
 * `multiple` when several files are given are skipped. Among the rest the
 * one sharing the deepest common ancestor with `el` wins. Returns null when
 * there is no candidate, so the caller falls back to drag-and-drop.
 */
export function findFileInputForDrop(
  el: Element,
  files: Array<{ name: string; mimeType: string }>
): HTMLInputElement | null {
  const root = fileInputSearchRoot(el);
  const found = collectFileInputs(root);
  if (root.shadowRoot) collectFileInputs(root.shadowRoot, found);
  const inputs = found.filter(
    (i) =>
      !i.matches(':disabled') &&
      (files.length <= 1 || i.multiple) &&
      files.every((f) => fileMatchesAccept(i.accept, f))
  );
  if (inputs.length === 0) return null;

  const depthOf = new Map<Element, number>();
  composedAncestors(el).forEach((a, i) => depthOf.set(a, i));

  let best: HTMLInputElement | null = null;
  let bestDist = Infinity;
  for (const input of inputs) {
    for (let cur: Element | null = input; cur; cur = composedParent(cur)) {
      const d = depthOf.get(cur);
      if (d !== undefined) {
        if (d < bestDist) {
          bestDist = d;
          best = input;
        }
        break;
      }
    }
  }
  return best;
}

function setInputFiles(input: HTMLInputElement, fileObjects: File[]): void {
  const dt = new DataTransfer();
  for (const file of fileObjects) {
    dt.items.add(file);
  }
  input.files = dt.files;
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
}

/**
 * Drop files onto an element by @ref.
 *
 * 1. The ref is an <input type="file">: set its files directly.
 * 2. Otherwise, if a (usually hidden) <input type="file"> in the same
 *    form/dialog or a few levels up accepts the files, set its files (see
 *    findFileInputForDrop). This avoids the OS file picker, which cannot be
 *    opened by untrusted clicks.
 * 3. Fallback: synthetic drag-and-drop events on the element.
 */
export function dropFiles(
  ref: string,
  files: Array<{ name: string; mimeType: string; base64Data: string }>
): { success: boolean; error?: string; method?: string } {
  const el = resolveRef(ref);
  if (!el) {
    return { success: false, error: `Element not found for ref ${ref}` };
  }

  if (!(el instanceof HTMLElement)) {
    return { success: false, error: `Element ${ref} is not an HTML element` };
  }

  const fileObjects = files.map((f) => base64ToFile(f.name, f.mimeType, f.base64Data));

  // Strategy 1: <input type="file"> — set files via DataTransfer
  if (el instanceof HTMLInputElement && el.type === 'file') {
    setInputFiles(el, fileObjects);
    return { success: true, method: 'file-input' };
  }

  // Strategy 2: a matching file input near the ref (incl. shadow DOM)
  const input = findFileInputForDrop(el, files);
  if (input) {
    setInputFiles(input, fileObjects);
    return { success: true, method: 'nearest-file-input' };
  }

  // Strategy 3: Drag-and-drop event sequence
  el.scrollIntoView?.({ behavior: 'instant', block: 'center' });
  const rect = el.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;

  const dt = new DataTransfer();
  for (const file of fileObjects) {
    dt.items.add(file);
  }

  const commonOpts = { bubbles: true, cancelable: true, clientX, clientY, dataTransfer: dt };

  el.dispatchEvent(new DragEvent('dragenter', commonOpts));
  el.dispatchEvent(new DragEvent('dragover', commonOpts));
  el.dispatchEvent(new DragEvent('drop', commonOpts));
  el.dispatchEvent(new DragEvent('dragleave', commonOpts));

  return { success: true, method: 'drag-and-drop' };
}

/** Invoke a WebMCP native tool via page context bridge */
export async function invokeWebMCPTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      window.removeEventListener('message', listener);
      resolve({ success: false, error: 'WebMCP tool invocation timed out' });
    }, 30_000);

    const requestId = `invoke-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const listener = (event: MessageEvent) => {
      if (
        event.source !== window ||
        event.data?.channel !== PAGE_BRIDGE_CHANNEL ||
        event.data?.type !== 'webmcp-invoke-result' ||
        event.data?.requestId !== requestId
      ) {
        return;
      }

      window.removeEventListener('message', listener);
      clearTimeout(timeoutId);
      resolve(event.data.result);
    };

    window.addEventListener('message', listener);

    window.postMessage(
      {
        channel: PAGE_BRIDGE_CHANNEL,
        type: 'invoke-webmcp-tool',
        requestId,
        toolName,
        args,
      },
      '*'
    );
  });
}
