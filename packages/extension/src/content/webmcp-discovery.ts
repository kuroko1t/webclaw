/**
 * WebMCP Discovery + Auto-Synthesis.
 *
 * 1. Native: Probes `navigator.modelContext` for WebMCP tool declarations
 * 2. Synthesis: Generates tool declarations from forms, buttons, inputs
 */
import type { WebMCPTool, JSONSchema } from '@webclaw/shared';
import { PAGE_BRIDGE_CHANNEL } from '@webclaw/shared';

/** Discovered tools cache */
let discoveredTools: WebMCPTool[] = [];

/**
 * Discover WebMCP tools on the current page.
 * Uses window.postMessage to communicate with MAIN world script.
 */
export async function discoverWebMCPTools(tabId: number): Promise<WebMCPTool[]> {
  const nativeTools = await discoverNativeTools(tabId);
  const synthesizedTools = synthesizeTools(tabId);

  discoveredTools = [...nativeTools, ...synthesizedTools];
  return discoveredTools;
}

/** Get previously discovered tools */
export function getCachedTools(): WebMCPTool[] {
  return discoveredTools;
}

// --- Native WebMCP Discovery ---

async function discoverNativeTools(tabId: number): Promise<WebMCPTool[]> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      window.removeEventListener('message', listener);
      resolve([]);
    }, 3000);

    const listener = (event: MessageEvent) => {
      if (
        event.source !== window ||
        event.data?.channel !== PAGE_BRIDGE_CHANNEL ||
        event.data?.type !== 'webmcp-tools-result'
      ) {
        return;
      }

      window.removeEventListener('message', listener);
      clearTimeout(timeoutId);

      const tools = (event.data.tools ?? []) as WebMCPTool[];
      resolve(
        tools.map((t) => ({
          ...t,
          source: 'webmcp-native' as const,
          tabId,
        }))
      );
    };

    window.addEventListener('message', listener);

    // Request tools from MAIN world
    window.postMessage(
      { channel: PAGE_BRIDGE_CHANNEL, type: 'discover-webmcp-tools' },
      '*'
    );
  });
}

// --- Auto-Synthesis ---

function synthesizeTools(tabId: number): WebMCPTool[] {
  const tools: WebMCPTool[] = [];

  // Synthesize from forms
  const forms = document.querySelectorAll('form');
  for (const form of forms) {
    const tool = synthesizeFormTool(form, tabId);
    if (tool) tools.push(tool);
  }

  // Synthesize from standalone buttons
  const buttons = document.querySelectorAll(
    'button:not(form button), [role="button"]:not(form [role="button"])'
  );
  for (const button of buttons) {
    const tool = synthesizeButtonTool(button as HTMLElement, tabId);
    if (tool) tools.push(tool);
  }

  return tools;
}

function synthesizeFormTool(
  form: HTMLFormElement,
  tabId: number
): WebMCPTool | null {
  const inputs = form.querySelectorAll('input, select, textarea');
  if (inputs.length === 0) return null;

  const formName = getFormName(form);
  const properties: Record<string, JSONSchema> = {};
  const required: string[] = [];

  for (const input of inputs) {
    const el = input as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    const name = el.name || el.id;
    if (!name) continue;
    if (el instanceof HTMLInputElement && (el.type === 'hidden' || el.type === 'submit')) continue;

    const fieldSchema = getFieldSchema(el);
    const label = getFieldLabel(el);

    properties[name] = {
      ...fieldSchema,
      description: label || name,
    };

    if (el.hasAttribute('required')) {
      required.push(name);
    }
  }

  if (Object.keys(properties).length === 0) return null;

  return {
    name: `form_${sanitizeName(formName)}`,
    description: `Submit form: ${formName}`,
    inputSchema: {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    },
    source: 'synthesized-form',
    tabId,
  };
}

function synthesizeButtonTool(
  button: HTMLElement,
  tabId: number
): WebMCPTool | null {
  const name = getButtonName(button);
  if (!name) return null;

  return {
    name: `button_${sanitizeName(name)}`,
    description: `Click button: ${name}`,
    inputSchema: { type: 'object', properties: {} },
    source: 'synthesized-button',
    tabId,
    elementRef: button.getAttribute('data-webclaw-ref') ?? undefined,
  };
}

// --- Helpers ---

function getFormName(form: HTMLFormElement): string {
  // Try aria-label, title, or action path
  if (form.getAttribute('aria-label')) return form.getAttribute('aria-label')!;
  if (form.title) return form.title;

  // Find nearest heading
  const heading = findNearestHeading(form);
  if (heading) return heading;

  // Submit button text
  const submit = form.querySelector(
    'button[type="submit"], input[type="submit"], button:not([type])'
  );
  if (submit) {
    const text = submit.textContent?.trim() || (submit as HTMLInputElement).value;
    if (text) return text;
  }

  if (form.action) {
    const url = new URL(form.action, location.href);
    return url.pathname.split('/').pop() ?? 'form';
  }

  return 'unnamed_form';
}

function getButtonName(el: HTMLElement): string {
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;

  const text = el.textContent?.trim();
  if (text && text.length < 50) return text;

  const title = el.getAttribute('title');
  if (title) return title;

  return '';
}

function getFieldLabel(
  el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
): string {
  // <label for="">
  if (el.id) {
    const label = document.querySelector(`label[for="${el.id}"]`);
    if (label?.textContent) return label.textContent.trim();
  }

  // Wrapping <label>
  const parentLabel = el.closest('label');
  if (parentLabel?.textContent) {
    const text = parentLabel.textContent.trim();
    const inputText = el instanceof HTMLInputElement ? el.value : '';
    return text.replace(inputText, '').trim();
  }

  // aria-label
  if (el.getAttribute('aria-label')) return el.getAttribute('aria-label')!;

  // placeholder
  if ('placeholder' in el && el.placeholder) return el.placeholder;

  return '';
}

function getFieldSchema(
  el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
): JSONSchema {
  if (el instanceof HTMLSelectElement) {
    const options = Array.from(el.options).map((o) => o.value);
    return { type: 'string', enum: options };
  }

  if (el instanceof HTMLTextAreaElement) {
    return { type: 'string' };
  }

  switch (el.type) {
    case 'number':
    case 'range':
      return { type: 'number' };
    case 'checkbox':
      return { type: 'boolean' };
    case 'email':
      return { type: 'string', description: 'Email address' };
    case 'url':
      return { type: 'string', description: 'URL' };
    case 'date':
      return { type: 'string', description: 'Date (YYYY-MM-DD)' };
    case 'tel':
      return { type: 'string', description: 'Phone number' };
    default:
      return { type: 'string' };
  }
}

function findNearestHeading(el: Element): string | null {
  let sibling = el.previousElementSibling;
  while (sibling) {
    if (/^H[1-6]$/.test(sibling.tagName)) {
      return sibling.textContent?.trim() ?? null;
    }
    sibling = sibling.previousElementSibling;
  }

  const parent = el.parentElement;
  if (parent) {
    const heading = parent.querySelector('h1, h2, h3, h4, h5, h6');
    if (heading) return heading.textContent?.trim() ?? null;
  }

  return null;
}

function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
}
