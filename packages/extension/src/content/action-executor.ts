/**
 * Action Executor - Performs DOM interactions on @ref-targeted elements.
 * Handles both WebMCP invocation and DOM fallback operations.
 */
import { resolveRef } from './snapshot-engine';
import { PAGE_BRIDGE_CHANNEL } from '@webclaw/shared';

/** Click an element by @ref */
export function clickElement(ref: string): { success: boolean; error?: string } {
  const el = resolveRef(ref);
  if (!el) {
    return { success: false, error: `Element not found for ref ${ref}` };
  }

  if (!(el instanceof HTMLElement)) {
    return { success: false, error: `Element ${ref} is not an HTMLElement` };
  }

  // Scroll into view
  el.scrollIntoView({ behavior: 'instant', block: 'center' });

  // Dispatch click events
  el.focus();
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
  el.click();

  return { success: true };
}

/** Type text into an element by @ref */
export function typeText(
  ref: string,
  text: string,
  clearFirst = true
): { success: boolean; error?: string } {
  const el = resolveRef(ref);
  if (!el) {
    return { success: false, error: `Element not found for ref ${ref}` };
  }

  if (
    !(el instanceof HTMLInputElement) &&
    !(el instanceof HTMLTextAreaElement) &&
    !el.getAttribute('contenteditable')
  ) {
    return { success: false, error: `Element ${ref} is not a text input` };
  }

  el.scrollIntoView({ behavior: 'instant', block: 'center' });
  (el as HTMLElement).focus();

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (clearFirst) {
      el.value = '';
    }

    // Use native input setter for React/Vue compatibility
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      'value'
    )?.set;

    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(el, clearFirst ? text : el.value + text);
    } else {
      el.value = clearFirst ? text : el.value + text;
    }

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    // contenteditable
    if (clearFirst) {
      el.textContent = '';
    }
    el.textContent = (el.textContent ?? '') + text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  return { success: true };
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

  el.scrollIntoView({ behavior: 'instant', block: 'center' });
  el.focus();

  // Find option by value or text
  let found = false;
  for (const option of el.options) {
    if (option.value === value || option.textContent?.trim() === value) {
      el.value = option.value;
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
