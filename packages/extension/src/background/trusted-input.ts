/**
 * Trusted keyboard input via the chrome.debugger (CDP) Input domain.
 *
 * Synthetic KeyboardEvents dispatched from a content script have
 * isTrusted=false, and many widgets ignore them (chip/tag inputs that commit
 * on comma/Enter, date pickers that commit on Enter, form submission).
 * CDP Input.insertText / Input.dispatchKeyEvent produce events that are
 * indistinguishable from real typing.
 */
import { tokenizeKeys } from '../content/key-tokens';

const KEYS = {
  Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
  Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, text: undefined },
  ',': { key: ',', code: 'Comma', windowsVirtualKeyCode: 188, text: ',' },
} as const;

/** Delay between key presses so frameworks can react (e.g. render a chip) */
const KEY_DELAY_MS = 50;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Type `text` into the currently focused element of the tab.
 * "\n" -> Enter, "\t" -> Tab, "," -> Comma key when `commaAsKey`
 * (otherwise commas are inserted as text). Everything else is inserted with
 * Input.insertText (IME-safe, works for Japanese).
 *
 * If `alreadyAttached` is false, the debugger is attached for the duration of
 * the call and detached afterwards.
 */
export async function typeWithDebugger(
  tabId: number,
  text: string,
  commaAsKey: boolean,
  alreadyAttached: boolean
): Promise<void> {
  const target = { tabId };
  if (!alreadyAttached) {
    await chrome.debugger.attach(target, '1.3');
  }
  try {
    // Key events are routed to the focused widget; when the browser window
    // has no OS focus (e.g. under WSLg/remote desktop) they would be dropped.
    await chrome.debugger
      .sendCommand(target, 'Emulation.setFocusEmulationEnabled', { enabled: true })
      .catch(() => {});
    await sleep(KEY_DELAY_MS);
    for (const token of tokenizeKeys(text, commaAsKey)) {
      if (token.kind === 'text') {
        await chrome.debugger.sendCommand(target, 'Input.insertText', { text: token.text });
      } else {
        const k = KEYS[token.key];
        const base = {
          key: k.key,
          code: k.code,
          windowsVirtualKeyCode: k.windowsVirtualKeyCode,
          nativeVirtualKeyCode: k.windowsVirtualKeyCode,
        };
        await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
          type: k.text ? 'keyDown' : 'rawKeyDown',
          ...base,
          ...(k.text ? { text: k.text, unmodifiedText: k.text } : {}),
        });
        await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
          type: 'keyUp',
          ...base,
        });
      }
      await sleep(KEY_DELAY_MS);
    }
  } finally {
    await chrome.debugger
      .sendCommand(target, 'Emulation.setFocusEmulationEnabled', { enabled: false })
      .catch(() => {});
    if (!alreadyAttached) {
      await chrome.debugger.detach(target).catch(() => {});
    }
  }
}
