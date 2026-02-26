/**
 * Compact A11y tree snapshot engine.
 *
 * Walks the DOM and produces a compact text representation with @ref labels
 * for interactive elements. Designed for minimal token usage while preserving
 * structural context for LLM-based navigation.
 */
import { createRefCounter, DEFAULT_SNAPSHOT_MAX_TOKENS } from 'webclaw-shared';
import type { SnapshotNode, SnapshotOptions } from 'webclaw-shared';

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
  '[contenteditable]:not([contenteditable="false"])',
  'summary',
].join(',');

/** Elements to skip entirely */
const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
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
  PRE: 'code',
  CODE: 'code',
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
  OUTPUT: 'status',
  PROGRESS: 'progressbar',
  METER: 'meter',
};

/**
 * Tags whose structural roles are removed when an ancestor has
 * role="presentation" or role="none" (ARIA "presentational children" rule).
 * Maps parent tag → set of child tags that lose their roles.
 */
const PRESENTATIONAL_CHILDREN: Record<string, Set<string>> = {
  TABLE: new Set(['THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD', 'CAPTION', 'COLGROUP', 'COL']),
  UL: new Set(['LI']),
  OL: new Set(['LI']),
  DL: new Set(['DT', 'DD']),
};

/** Check if element's structural role is stripped by a presentational ancestor */
function isPresentationalChild(el: Element): boolean {
  const tag = el.tagName;
  let parent = el.parentElement;
  while (parent) {
    const parentRole = parent.getAttribute('role');
    if (parentRole === 'presentation' || parentRole === 'none') {
      const parentTag = parent.tagName;
      const children = PRESENTATIONAL_CHILDREN[parentTag];
      if (children?.has(tag)) return true;
    }
    // Stop walking once we leave the presentational scope
    if (parent.getAttribute('role') && parent.getAttribute('role') !== 'presentation' && parent.getAttribute('role') !== 'none') {
      break;
    }
    parent = parent.parentElement;
  }
  return false;
}

/** Get the accessible role for an element */
function getRole(el: Element): string {
  // Explicit ARIA role
  const ariaRole = el.getAttribute('role');
  if (ariaRole) {
    // presentation/none mean "remove semantic role" — treat as no role
    if (ariaRole === 'presentation' || ariaRole === 'none') return '';
    return ariaRole;
  }

  const tag = el.tagName;

  // Interactive elements (not affected by presentational children rule)
  if (tag === 'A' && el.hasAttribute('href')) return 'link';
  if (tag === 'BUTTON' || tag === 'SUMMARY') return 'button';
  if (tag === 'SELECT') return (el as HTMLSelectElement).multiple ? 'listbox' : 'combobox';
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
      case 'button':
      case 'image': return 'button';
      default: return 'textbox';
    }
  }

  // Heading levels
  const headingMatch = tag.match(/^H([1-6])$/);
  if (headingMatch) return `heading[${headingMatch[1]}]`;

  // Img with alt
  if (tag === 'IMG') return 'img';

  // Structural roles — check presentational children rule
  if (tag in STRUCTURAL_ROLES) {
    if (isPresentationalChild(el)) return '';
    return STRUCTURAL_ROLES[tag];
  }

  return '';
}

/** Get the accessible name for an element */
function getAccessibleName(el: Element): string {
  // aria-labelledby (highest priority per W3C accname spec step 2A)
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labels = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim())
      .filter(Boolean);
    if (labels.length) return labels.join(' ');
  }

  // aria-label (step 2B)
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.trim();

  // <label> for inputs
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
    if (el.id) {
      const escapedId = el.id.replace(/["\\]/g, '\\$&');
      const label = document.querySelector(`label[for="${escapedId}"]`);
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

  // Direct text for buttons, links, headings, legends
  // (per W3C accname spec: subtree content before title attribute)
  // Collapse whitespace: DOM textContent preserves source formatting (newlines, indentation)
  // but browsers render consecutive whitespace as a single space in normal flow.
  const tag = el.tagName;
  if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY' || tag === 'LEGEND' || /^H[1-6]$/.test(tag)) {
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (text) return text;
  }

  // alt for images and image inputs
  if (el instanceof HTMLImageElement && el.alt) return el.alt;
  if (el instanceof HTMLInputElement && el.type === 'image' && el.alt) return el.alt;

  // title attribute (fallback — used when no textContent or other name source)
  const title = el.getAttribute('title');
  if (title) {
    return title.replace(/\s+/g, ' ').trim();
  }

  // Text content for leaf elements with a role (explicit ARIA or implicit structural)
  // Covers table cells, list items, definitions, alert/status, etc.
  const ariaRole = el.getAttribute('role');
  const hasRole = ariaRole || el.tagName in STRUCTURAL_ROLES;
  if (hasRole && !el.children.length) {
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (text) return text;
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
    if (el.type === 'password') return undefined;
    if (el.value) return el.value;
  }
  if (el instanceof HTMLTextAreaElement && el.value) return el.value;
  if (el instanceof HTMLSelectElement) {
    if (el.multiple) {
      const selected = Array.from(el.selectedOptions)
        .map(o => o.textContent?.trim())
        .filter(Boolean);
      return selected.length > 0 ? selected.join(', ') : undefined;
    }
    const selected = el.selectedOptions[0];
    if (selected) return selected.textContent?.trim();
  }
  if (el.tagName === 'OUTPUT') {
    const text = el.textContent?.trim();
    if (text) return text;
  }
  if (el instanceof HTMLProgressElement) {
    return `${el.value}/${el.max}`;
  }
  if (el instanceof HTMLMeterElement) {
    return String(el.value);
  }
  return undefined;
}

/**
 * Check element visibility. Returns:
 * - 'visible': element is visible
 * - 'hidden': element and all children are hidden (display:none)
 * - 'self-hidden': element itself is hidden but children may be visible (visibility:hidden, opacity:0)
 */
function getVisibility(el: Element): 'visible' | 'hidden' | 'self-hidden' {
  if (!(el instanceof HTMLElement)) return 'visible';
  const style = getComputedStyle(el);
  // display:none hides the entire subtree — no children are rendered
  if (style.display === 'none') return 'hidden';
  // opacity:0 hides the element visually, but children may become visible
  // via CSS transitions/hover/focus (treat like visibility:hidden)
  if (style.opacity === '0') return 'self-hidden';
  // visibility:hidden hides the element itself,
  // but children can override with visibility:visible
  if (style.visibility === 'hidden') return 'self-hidden';
  return 'visible';
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
  if (el.getAttribute('aria-hidden') === 'true') return null;

  const vis = getVisibility(el);
  // display:none hides the entire subtree — skip completely
  if (vis === 'hidden') return null;

  const selfHidden = vis === 'self-hidden';

  const role = selfHidden ? '' : getRole(el);
  const interactive = selfHidden ? false : isInteractive(el);

  // Process children (always walk children even if self is hidden,
  // because visibility:hidden children can override with visibility:visible)
  const children: SnapshotNode[] = [];
  for (const child of el.children) {
    const childNode = walkDOM(child, refCounter, options);
    if (childNode) children.push(childNode);
  }
  // Process shadow DOM if present (open shadow roots)
  if (el.shadowRoot) {
    for (const shadowChild of el.shadowRoot.children) {
      const childNode = walkDOM(shadowChild, refCounter, options);
      if (childNode) children.push(childNode);
    }
  }

  // If this element is self-hidden, only pass through children
  if (selfHidden) {
    if (children.length === 0) return null;
    if (children.length === 1) return children[0];
    return { role: 'group', children };
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

  // Fallback: if element has a role and all DOM children collapsed to null,
  // use textContent as the name (handles <td><span>text</span></td> etc.)
  if (!node.name && children.length === 0 && el.children.length > 0 && role) {
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (text) {
      node.name = text;
    }
  }

  const value = getValue(el);
  if (value !== undefined) node.value = value;

  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox' || el.type === 'radio') {
      node.checked = el.checked;
    }
  } else {
    // Capture aria-checked for custom checkboxes/radios/switches
    const ariaChecked = el.getAttribute('aria-checked');
    if (ariaChecked === 'true') {
      node.checked = true;
    } else if (ariaChecked === 'false') {
      node.checked = false;
    }
  }

  if (
    (el instanceof HTMLInputElement ||
      el instanceof HTMLButtonElement ||
      el instanceof HTMLSelectElement ||
      el instanceof HTMLTextAreaElement) &&
    el.matches(':disabled')
  ) {
    node.disabled = true;
  } else if (el.getAttribute('aria-disabled') === 'true') {
    node.disabled = true;
  }

  // Capture ARIA state attributes
  const ariaExpanded = el.getAttribute('aria-expanded');
  if (ariaExpanded === 'true') {
    node.expanded = true;
  } else if (ariaExpanded === 'false') {
    node.expanded = false;
  }

  const ariaSelected = el.getAttribute('aria-selected');
  if (ariaSelected === 'true') {
    node.selected = true;
  } else if (ariaSelected === 'false') {
    node.selected = false;
  }

  const ariaPressed = el.getAttribute('aria-pressed');
  if (ariaPressed === 'true') {
    node.pressed = true;
  } else if (ariaPressed === 'false') {
    node.pressed = false;
  }

  if (children.length > 0) node.children = children;

  return node;
}

/** Optimize snapshot tree to reduce token waste */
function optimizeTree(node: SnapshotNode): SnapshotNode {
  if (!node.children) return node;

  const newChildren: SnapshotNode[] = [];
  for (const child of node.children) {
    const opt = optimizeTree(child);

    // Skip [rowgroup] — always structural (<thead>/<tbody>), promote children
    if (opt.role === 'rowgroup' && !opt.ref && !opt.name) {
      if (opt.children) newChildren.push(...opt.children);
      continue;
    }

    // Skip [listitem] with single child — promote the child
    if (opt.role === 'listitem' && !opt.ref && !opt.name && opt.children?.length === 1) {
      newChildren.push(opt.children[0]);
      continue;
    }

    // Skip [img] with no name (decorative images)
    if (opt.role === 'img' && !opt.ref && !opt.name) {
      continue;
    }

    // Skip empty [cell] — no children, no name
    if (opt.role === 'cell' && !opt.ref && !opt.name && !opt.children) {
      continue;
    }

    newChildren.push(opt);
  }

  return {
    ...node,
    children: newChildren.length > 0 ? newChildren : undefined,
  };
}

/** Format a single node inline (no newline, no children expansion) */
function formatNodeInline(node: SnapshotNode): string {
  let text = '[';
  if (node.ref) text += `${node.ref} `;
  text += node.role;
  if (node.name) text += ` "${node.name}"`;
  text += ']';
  if (node.value !== undefined) text += ` ${node.value}`;
  if (node.checked !== undefined) text += node.checked ? ' (checked)' : ' (unchecked)';
  if (node.disabled) text += ' (disabled)';
  if (node.expanded !== undefined) text += node.expanded ? ' (expanded)' : ' (collapsed)';
  if (node.selected !== undefined) text += node.selected ? ' (selected)' : ' (unselected)';
  if (node.pressed !== undefined) text += node.pressed ? ' (pressed)' : ' (unpressed)';
  return text;
}

/** Format a snapshot node into compact text */
function formatNode(node: SnapshotNode, indent: number): string {
  const lines: string[] = [];
  const pad = ' '.repeat(indent);
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

  if (node.expanded !== undefined) {
    line += node.expanded ? ' (expanded)' : ' (collapsed)';
  }

  if (node.selected !== undefined) {
    line += node.selected ? ' (selected)' : ' (unselected)';
  }

  if (node.pressed !== undefined) {
    line += node.pressed ? ' (pressed)' : ' (unpressed)';
  }

  // Table row compaction: if all cells have ≤1 child, render as single line
  if (node.role === 'row' && node.children) {
    const allSimple = node.children.every(c => {
      if (c.role !== 'cell' && c.role !== 'columnheader') return false;
      if (!c.children || c.children.length === 0) return true; // empty cell
      if (c.children.length > 1) return false; // multiple children
      // Single child: only simple if it's a leaf (no nested children)
      return !c.children[0].children;
    });
    if (allSimple) {
      const cellTexts = node.children.map(c => {
        if (!c.children || c.children.length === 0) {
          // Empty cell or cell with name only
          return c.name || '';
        }
        // Single-child cell: format child inline
        return formatNodeInline(c.children[0]);
      });
      lines.push(`${pad}[row] ${cellTexts.join(' | ')}`);
      return lines.join('\n');
    }
  }

  lines.push(line);

  if (node.children) {
    for (const child of node.children) {
      lines.push(formatNode(child, indent + 1));
    }
  }

  return lines.join('\n');
}

/**
 * Prune a snapshot tree to only include nodes that have a @ref (interactive)
 * or are structural ancestors of such nodes. Returns null if the subtree
 * contains no interactive elements.
 */
function pruneNonInteractive(node: SnapshotNode): SnapshotNode | null {
  // Leaf node: keep only if it has a ref
  if (!node.children) {
    return node.ref ? { ...node } : null;
  }

  // Recurse into children, keeping only branches with interactive elements
  const keptChildren: SnapshotNode[] = [];
  for (const child of node.children) {
    const pruned = pruneNonInteractive(child);
    if (pruned) keptChildren.push(pruned);
  }

  // If this node itself is interactive, keep it (with pruned children)
  if (node.ref) {
    return {
      ...node,
      children: keptChildren.length > 0 ? keptChildren : undefined,
    };
  }

  // Not interactive: only keep if it has interactive descendants
  if (keptChildren.length === 0) return null;
  // Single surviving child — unwrap unless this node carries a meaningful role
  if (keptChildren.length === 1 && node.role === 'group') {
    return keptChildren[0];
  }
  return {
    ...node,
    children: keptChildren,
  };
}

/** Aliases for focusRegion parameter to landmark roles */
const FOCUS_REGION_ALIASES: Record<string, string> = {
  header: 'banner',
  footer: 'contentinfo',
  sidebar: 'complementary',
};

/** Recursively find all nodes matching a given role */
function findNodesByRole(node: SnapshotNode, role: string): SnapshotNode[] {
  const results: SnapshotNode[] = [];
  if (node.role === role) {
    results.push(node);
  }
  if (node.children) {
    for (const child of node.children) {
      results.push(...findNodesByRole(child, role));
    }
  }
  return results;
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

  // Apply focusRegion filter: extract only the matching landmark subtree(s)
  let filteredChildren = tree ? [tree] : [];
  if (options.focusRegion && tree) {
    const regionRole = FOCUS_REGION_ALIASES[options.focusRegion] ?? options.focusRegion;
    const matches = findNodesByRole(tree, regionRole);
    if (matches.length > 0) {
      filteredChildren = matches;
    }
    // If no matches, fall back to full tree
  }

  // Apply interactiveOnly filter: prune non-interactive subtrees
  if (options.interactiveOnly) {
    const pruned: SnapshotNode[] = [];
    for (const child of filteredChildren) {
      const p = pruneNonInteractive(child);
      if (p) pruned.push(p);
    }
    filteredChildren = pruned;
  }

  const pageNode: SnapshotNode = {
    role: 'page',
    name: document.title,
    children: filteredChildren,
  };

  const optimizedPage = optimizeTree(pageNode);
  let text = formatNode(optimizedPage, 0);

  // Token budget control with smart truncation (85% head / 15% tail)
  const maxTokens = options.maxTokens ?? DEFAULT_SNAPSHOT_MAX_TOKENS;
  const estimatedTokens = Math.ceil(text.length / 4);
  if (maxTokens > 0 && estimatedTokens > maxTokens) {
    const maxChars = maxTokens * 4;
    const headBudget = Math.floor(maxChars * 0.85);
    const tailBudget = maxChars - headBudget;
    const lines = text.split('\n');

    // Build head portion (line-boundary)
    let headEnd = 0;
    let headLen = 0;
    for (let i = 0; i < lines.length; i++) {
      const lineLen = lines[i].length + 1; // +1 for newline
      if (headLen + lineLen > headBudget) break;
      headLen += lineLen;
      headEnd = i + 1;
    }

    // Build tail portion (line-boundary, from end)
    let tailStart = lines.length;
    let tailLen = 0;
    for (let i = lines.length - 1; i >= headEnd; i--) {
      const lineLen = lines[i].length + 1;
      if (tailLen + lineLen > tailBudget) break;
      tailLen += lineLen;
      tailStart = i;
    }

    const headPart = lines.slice(0, headEnd).join('\n');
    const tailPart = lines.slice(tailStart).join('\n');
    const omitted = tailStart - headEnd;
    text = headPart + `\n... (${omitted} lines omitted)\n` + tailPart;
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
  if (!ref || !ref.startsWith('@e')) return null;
  const el = refMap.get(ref);
  if (!el || !el.isConnected) return null;
  return el;
}

/** Get the current snapshot ID */
export function getCurrentSnapshotId(): string {
  return currentSnapshotId;
}
