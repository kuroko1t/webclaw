/**
 * Compact A11y tree snapshot engine.
 *
 * Walks the DOM and produces a compact text representation with @ref labels
 * for interactive elements. Designed for minimal token usage while preserving
 * structural context for LLM-based navigation.
 */
import { createRefCounter, DEFAULT_SNAPSHOT_MAX_TOKENS } from '@webclaw/shared';
import type { SnapshotNode, SnapshotOptions } from '@webclaw/shared';

/** Map of @ref → DOM element for the current snapshot */
let refMap = new Map<string, Element>();
let currentSnapshotId = '';

/** Interactive element selectors */
const INTERACTIVE_SELECTORS = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="combobox"]',
  '[role="searchbox"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[contenteditable="true"]',
].join(',');

/** Elements to skip entirely */
const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'SVG',
  'PATH',
  'META',
  'LINK',
  'HEAD',
  'BR',
]);

/** Structural roles worth preserving */
const STRUCTURAL_ROLES: Record<string, string> = {
  NAV: 'nav',
  MAIN: 'main',
  HEADER: 'banner',
  FOOTER: 'contentinfo',
  ASIDE: 'complementary',
  SECTION: 'region',
  ARTICLE: 'article',
  FORM: 'form',
  TABLE: 'table',
  THEAD: 'rowgroup',
  TBODY: 'rowgroup',
  TR: 'row',
  TH: 'columnheader',
  TD: 'cell',
  UL: 'list',
  OL: 'list',
  LI: 'listitem',
  DL: 'list',
  DT: 'term',
  DD: 'definition',
  DIALOG: 'dialog',
  DETAILS: 'group',
  SUMMARY: 'button',
  FIELDSET: 'group',
  LEGEND: 'legend',
};

/** Get the accessible role for an element */
function getRole(el: Element): string {
  // Explicit ARIA role
  const ariaRole = el.getAttribute('role');
  if (ariaRole) return ariaRole;

  const tag = el.tagName;

  // Interactive elements
  if (tag === 'A' && el.hasAttribute('href')) return 'link';
  if (tag === 'BUTTON' || tag === 'SUMMARY') return 'button';
  if (tag === 'SELECT') return 'combobox';
  if (tag === 'TEXTAREA') return 'textbox';
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    switch (type) {
      case 'checkbox': return 'checkbox';
      case 'radio': return 'radio';
      case 'range': return 'slider';
      case 'number': return 'spinbutton';
      case 'search': return 'searchbox';
      case 'submit':
      case 'reset':
      case 'button': return 'button';
      default: return 'textbox';
    }
  }

  // Heading levels
  const headingMatch = tag.match(/^H([1-6])$/);
  if (headingMatch) return `heading[${headingMatch[1]}]`;

  // Img with alt
  if (tag === 'IMG') return 'img';

  // Structural roles
  if (tag in STRUCTURAL_ROLES) return STRUCTURAL_ROLES[tag];

  return '';
}

/** Get the accessible name for an element */
function getAccessibleName(el: Element): string {
  // aria-label
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.trim();

  // aria-labelledby
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labels = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim())
      .filter(Boolean);
    if (labels.length) return labels.join(' ');
  }

  // <label> for inputs
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
    if (el.id) {
      const label = document.querySelector(`label[for="${el.id}"]`);
      if (label) return label.textContent?.trim() ?? '';
    }
    // Wrapping <label>
    const parentLabel = el.closest('label');
    if (parentLabel) {
      const text = getDirectTextContent(parentLabel, el);
      if (text) return text;
    }
    // Placeholder
    if ('placeholder' in el && el.placeholder) return el.placeholder;
  }

  // title attribute
  const title = el.getAttribute('title');
  if (title) return title.trim();

  // alt for images
  if (el instanceof HTMLImageElement && el.alt) return el.alt;

  // Direct text for buttons, links, headings
  const tag = el.tagName;
  if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY' || /^H[1-6]$/.test(tag)) {
    const text = el.textContent?.trim() ?? '';
    return text.length > 80 ? text.slice(0, 77) + '...' : text;
  }

  return '';
}

/** Get text content excluding a specific child element */
function getDirectTextContent(parent: Element, exclude: Element): string {
  let text = '';
  for (const node of parent.childNodes) {
    if (node === exclude) continue;
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? '';
    }
  }
  return text.trim();
}

/** Get the current value for an interactive element */
function getValue(el: Element): string | undefined {
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox' || el.type === 'radio') return undefined;
    if (el.value) return el.value;
  }
  if (el instanceof HTMLTextAreaElement && el.value) return el.value;
  if (el instanceof HTMLSelectElement) {
    const selected = el.selectedOptions[0];
    if (selected) return selected.textContent?.trim();
  }
  return undefined;
}

/** Check if element is visible */
function isVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return true;
  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  // offsetWidth/Height are 0 in jsdom and some edge cases.
  // Only use them as a signal if they're explicitly available.
  if (el.offsetWidth !== undefined && el.offsetHeight !== undefined) {
    if (el.offsetWidth === 0 && el.offsetHeight === 0 && style.display !== '') {
      // In real browsers, zero-dimension elements are hidden.
      // But in jsdom, offsetWidth/Height are always 0, so skip this check
      // when getComputedStyle doesn't report explicit dimensions.
      const hasBrowserLayout = el.getBoundingClientRect().width > 0;
      if (hasBrowserLayout === false && style.display !== '') {
        // Likely jsdom - trust display/visibility only
        return true;
      }
    }
  }
  return true;
}

/** Check if element matches interactive selectors */
function isInteractive(el: Element): boolean {
  return el.matches(INTERACTIVE_SELECTORS);
}

/** Walk the DOM and build a snapshot tree */
function walkDOM(
  el: Element,
  refCounter: { next(): string; count(): number },
  options: SnapshotOptions
): SnapshotNode | null {
  if (SKIP_TAGS.has(el.tagName)) return null;
  if (!isVisible(el)) return null;

  const role = getRole(el);
  const interactive = isInteractive(el);

  // Process children
  const children: SnapshotNode[] = [];
  for (const child of el.children) {
    const childNode = walkDOM(child, refCounter, options);
    if (childNode) children.push(childNode);
  }

  // Skip non-structural, non-interactive elements that have <=1 child
  if (!role && !interactive) {
    if (children.length === 0) return null;
    if (children.length === 1) return children[0];
    // Multiple children but no role - create generic group
    return { role: 'group', children };
  }

  const node: SnapshotNode = {
    role: role || 'generic',
  };

  // Assign @ref to interactive elements
  if (interactive) {
    const ref = refCounter.next();
    node.ref = ref;
    refMap.set(ref, el);
  }

  const name = getAccessibleName(el);
  if (name) node.name = name;

  const value = getValue(el);
  if (value !== undefined) node.value = value;

  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox' || el.type === 'radio') {
      node.checked = el.checked;
    }
  }

  if (
    (el instanceof HTMLInputElement ||
      el instanceof HTMLButtonElement ||
      el instanceof HTMLSelectElement ||
      el instanceof HTMLTextAreaElement) &&
    el.disabled
  ) {
    node.disabled = true;
  }

  if (children.length > 0) node.children = children;

  return node;
}

/** Format a snapshot node into compact text */
function formatNode(node: SnapshotNode, indent: number): string {
  const lines: string[] = [];
  const pad = '  '.repeat(indent);
  let line = `${pad}[`;

  if (node.ref) {
    line += `${node.ref} `;
  }

  line += node.role;

  if (node.name) {
    line += ` "${node.name}"`;
  }

  line += ']';

  if (node.value !== undefined) {
    line += ` ${node.value}`;
  }

  if (node.checked !== undefined) {
    line += node.checked ? ' (checked)' : ' (unchecked)';
  }

  if (node.disabled) {
    line += ' (disabled)';
  }

  lines.push(line);

  if (node.children) {
    for (const child of node.children) {
      lines.push(formatNode(child, indent + 1));
    }
  }

  return lines.join('\n');
}

/** Generate a snapshot ID */
function generateSnapshotId(): string {
  return `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Take a compact snapshot of the current page.
 */
export function takeSnapshot(
  options: SnapshotOptions = {}
): { text: string; snapshotId: string; url: string; title: string } {
  // Reset ref map for new snapshot
  refMap = new Map();
  currentSnapshotId = generateSnapshotId();

  const refCounter = createRefCounter();
  const tree = walkDOM(document.body, refCounter, options);

  const pageNode: SnapshotNode = {
    role: 'page',
    name: document.title,
    children: tree ? [tree] : [],
  };

  let text = formatNode(pageNode, 0);

  // Token budget control
  const maxTokens = options.maxTokens ?? DEFAULT_SNAPSHOT_MAX_TOKENS;
  const estimatedTokens = Math.ceil(text.length / 4);
  if (estimatedTokens > maxTokens) {
    // Truncate with note
    const maxChars = maxTokens * 4;
    text = text.slice(0, maxChars) + '\n... (truncated)';
  }

  return {
    text,
    snapshotId: currentSnapshotId,
    url: location.href,
    title: document.title,
  };
}

/** Resolve a @ref to its DOM element */
export function resolveRef(ref: string): Element | null {
  return refMap.get(ref) ?? null;
}

/** Get the current snapshot ID */
export function getCurrentSnapshotId(): string {
  return currentSnapshotId;
}
