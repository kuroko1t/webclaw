/**
 * Trusted keyboard input via the chrome.debugger (CDP) Input domain.
 *
 * Synthetic KeyboardEvents dispatched from a content script have
 * isTrusted=false, and many widgets ignore them (chip/tag inputs that commit
 * on comma/Enter, date pickers that commit on Enter, form submission).
 * CDP Input.insertText / Input.dispatchKeyEvent produce events that are
 * indistinguishable from real typing.
 */
import { trustedTypingBudgetMs } from 'webclaw-shared';
import { tokenizeKeys } from '../content/key-tokens';

const KEYS = {
  Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
  Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, text: undefined },
  ',': { key: ',', code: 'Comma', windowsVirtualKeyCode: 188, text: ',' },
} as const;

/** Delay after each key press so frameworks can react (e.g. render a chip) */
export const KEY_DELAY_MS = 50;

/**
 * Upper bound for a single CDP command. Input.dispatchKeyEvent does not
 * return while a JavaScript dialog (opened e.g. by an Enter that submits a
 * form) blocks the page.
 */
export const COMMAND_TIMEOUT_MS = 3_000;

/**
 * Upper bound for resetting focus emulation after typing. When a dialog
 * blocks the page this command does not return either; waiting the full
 * COMMAND_TIMEOUT_MS again would double the time until type_text returns.
 */
export const CLEANUP_TIMEOUT_MS = 500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Release function returned when the debugger session is borrowed. */
export type ReleaseDebugger = () => Promise<void>;

/** Attach (or borrow) the debugger for a tab. */
export type AcquireDebugger = (tabId: number) => Promise<ReleaseDebugger>;

/**
 * Error from typeWithDebugger. `phase: 'attach'` means nothing was typed
 * (the caller may fall back to synthetic events); `phase: 'input'` means
 * typing stopped part way and must not be retried blindly.
 */
export class TrustedInputError extends Error {
  constructor(
    message: string,
    readonly phase: 'attach' | 'input',
    /** Characters of the (CRLF-normalized) text that were sent */
    readonly sentChars = 0,
    readonly totalChars = 0
  ) {
    super(message);
    this.name = 'TrustedInputError';
  }
}

export interface TypeWithDebuggerOptions {
  /** Send "," as the Comma key instead of inserting it as text */
  commaAsKey: boolean;
  /** How to get the debugger session. Defaults to attaching directly. */
  acquire?: AcquireDebugger;
  /** Total time budget; defaults to trustedTypingBudgetMs(text). */
  budgetMs?: number;
  /** Timeout for each CDP command. */
  commandTimeoutMs?: number;
}

const attachDirectly: AcquireDebugger = async (tabId) => {
  await chrome.debugger.attach({ tabId }, '1.3');
  return async () => {
    await chrome.debugger.detach({ tabId }).catch(() => {});
  };
};

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `${what} did not complete within ${ms}ms ` +
            '(a JavaScript dialog may be blocking the page; use handle_dialog)'
        )
      );
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Type `text` into the currently focused element of the tab.
 * "\n" -> Enter, "\t" -> Tab, "," -> Comma key when `commaAsKey`
 * (otherwise commas are inserted as text). Everything else is inserted with
 * Input.insertText (IME-safe, works for Japanese).
 *
 * The debugger session is obtained with `acquire` and always released
 * afterwards, also when a command fails or times out.
 */
export async function typeWithDebugger(
  tabId: number,
  text: string,
  options: TypeWithDebuggerOptions
): Promise<void> {
  const target = { tabId };
  const normalized = text.replace(/\r\n?/g, '\n');
  const tokens = tokenizeKeys(normalized, options.commaAsKey);
  const budgetMs = options.budgetMs ?? trustedTypingBudgetMs(text);
  const commandTimeoutMs = options.commandTimeoutMs ?? COMMAND_TIMEOUT_MS;

  let release: ReleaseDebugger;
  try {
    release = await (options.acquire ?? attachDirectly)(tabId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new TrustedInputError(`Could not attach the debugger: ${message}`, 'attach');
  }

  const deadline = Date.now() + budgetMs;
  const send = (method: string, params?: object): Promise<unknown> => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return Promise.reject(new Error(`Time budget of ${budgetMs}ms for typing was used up`));
    }
    return withTimeout(
      chrome.debugger.sendCommand(target, method, params) as Promise<unknown>,
      Math.min(commandTimeoutMs, remaining),
      method
    );
  };

  let sentChars = 0;
  let steps = 0;
  try {
    // Key events are routed to the focused widget; when the browser window
    // has no OS focus (e.g. under WSLg/remote desktop) they would be dropped.
    await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
    for (const token of tokens) {
      if (token.kind === 'text') {
        await send('Input.insertText', { text: token.text });
        sentChars += token.text.length;
      } else {
        const k = KEYS[token.key];
        const base = {
          key: k.key,
          code: k.code,
          windowsVirtualKeyCode: k.windowsVirtualKeyCode,
          nativeVirtualKeyCode: k.windowsVirtualKeyCode,
        };
        await send('Input.dispatchKeyEvent', {
          type: k.text ? 'keyDown' : 'rawKeyDown',
          ...base,
          ...(k.text ? { text: k.text, unmodifiedText: k.text } : {}),
        });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
        sentChars += 1;
        await sleep(KEY_DELAY_MS);
      }
      steps++;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new TrustedInputError(
      `Typing stopped after ${sentChars} of ${normalized.length} characters ` +
        `(${steps} of ${tokens.length} steps) were sent: ${message}. ` +
        'The field may now hold partial input; take a new snapshot before typing again.',
      'input',
      sentChars,
      normalized.length
    );
  } finally {
    await withTimeout(
      chrome.debugger.sendCommand(target, 'Emulation.setFocusEmulationEnabled', {
        enabled: false,
      }) as Promise<unknown>,
      Math.min(commandTimeoutMs, CLEANUP_TIMEOUT_MS),
      'Emulation.setFocusEmulationEnabled'
    ).catch(() => {});
    await release().catch(() => {});
  }
}
