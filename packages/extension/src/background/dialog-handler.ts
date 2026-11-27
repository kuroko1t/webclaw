/**
 * Handles native browser dialogs (alert/confirm/prompt) via CDP.
 *
 * Uses chrome.debugger API to listen for Page.javascriptDialogOpening events
 * and respond with Page.handleJavaScriptDialog commands.
 *
 * Strategy: attach debugger on first handle_dialog call, keep it attached
 * for the tab to catch dialog events. Detach when tab is removed.
 *
 * The handler also owns the debugger session for other short-lived users
 * (trusted key input): they borrow it with acquireDebugger(), so only one
 * attach exists per tab and handle_dialog keeps working while they type.
 */
import type { HandleDialogParams, HandleDialogResult } from 'webclaw-shared';

interface PendingDialog {
  type: 'alert' | 'confirm' | 'prompt' | 'beforeunload';
  message: string;
  defaultPrompt: string;
  url: string;
  timestamp: number;
}

/** Timeout for waiting for a dialog to appear after attach */
const DIALOG_DETECT_TIMEOUT_MS = 3_000;

export class DialogHandler {
  private pendingDialogs = new Map<number, PendingDialog>();
  private attachedTabs = new Set<number>();
  /** Tabs attached for handle_dialog; these stay attached. */
  private persistentTabs = new Set<number>();
  /** Number of active acquireDebugger() leases per tab. */
  private leases = new Map<number, number>();
  /** In-flight attach per tab so concurrent callers share a single attach. */
  private attaching = new Map<number, Promise<void>>();

  constructor() {
    // Listen for CDP events from all debugger-attached tabs
    chrome.debugger.onEvent.addListener(
      (source: chrome.debugger.Debuggee, method: string, params?: object) => {
        this.onDebuggerEvent(source, method, params);
      }
    );

    // Clean up if debugger is detached externally (e.g., user opens DevTools)
    chrome.debugger.onDetach.addListener(
      (source: chrome.debugger.Debuggee, _reason: string) => {
        if (source.tabId !== undefined) {
          this.attachedTabs.delete(source.tabId);
          this.persistentTabs.delete(source.tabId);
          this.leases.delete(source.tabId);
          this.pendingDialogs.delete(source.tabId);
        }
      }
    );
  }

  /** Handle a dialog request: attach debugger, detect/handle dialog */
  async handleDialog(
    tabId: number,
    params: HandleDialogParams
  ): Promise<HandleDialogResult> {
    // If we already have a pending dialog from a previous event, handle it directly
    const existing = this.pendingDialogs.get(tabId);
    if (existing) {
      return this.respondToDialog(tabId, existing, params);
    }

    // Attach debugger (stays attached to catch future events)
    await this.ensureAttached(tabId, true);

    // Try direct CDP command first — handles pre-existing dialogs immediately
    // without waiting for an event that won't re-fire.
    const directResult = await this.tryHandleDirectly(tabId, params);
    if (directResult.handled) {
      return directResult;
    }

    // No existing dialog — wait briefly for one to appear
    const dialog = await this.waitForDialog(tabId, DIALOG_DETECT_TIMEOUT_MS);

    if (dialog) {
      return this.respondToDialog(tabId, dialog, params);
    }

    return { handled: false };
  }

  /** Clear stale dialog state when a tab navigates */
  onTabNavigated(tabId: number): void {
    this.pendingDialogs.delete(tabId);
  }

  /** Clean up resources when a tab is removed */
  onTabRemoved(tabId: number): void {
    this.pendingDialogs.delete(tabId);
    this.persistentTabs.delete(tabId);
    this.leases.delete(tabId);
    if (this.attachedTabs.has(tabId)) {
      this.attachedTabs.delete(tabId);
      // Tab is already gone, no need to detach
    }
  }

  private onDebuggerEvent(
    source: chrome.debugger.Debuggee,
    method: string,
    params?: object
  ): void {
    if (method !== 'Page.javascriptDialogOpening' || source.tabId === undefined) {
      return;
    }

    const dialogParams = params as {
      type: string;
      message: string;
      defaultPrompt?: string;
      url: string;
    };

    this.pendingDialogs.set(source.tabId, {
      type: dialogParams.type as PendingDialog['type'],
      message: dialogParams.message,
      defaultPrompt: dialogParams.defaultPrompt ?? '',
      url: dialogParams.url,
      timestamp: Date.now(),
    });
  }

  /** Whether the debugger is currently attached to the tab by this handler */
  isAttached(tabId: number): boolean {
    return this.attachedTabs.has(tabId);
  }

  /**
   * Borrow the tab's debugger session, attaching it if needed. Returns a
   * release function. The debugger is detached when the last lease is
   * released, unless handle_dialog uses the tab or a dialog opened meanwhile
   * (then it stays attached so handle_dialog can answer the dialog).
   */
  async acquireDebugger(tabId: number): Promise<() => Promise<void>> {
    await this.ensureAttached(tabId);
    this.leases.set(tabId, (this.leases.get(tabId) ?? 0) + 1);
    let released = false;
    return async () => {
      if (released) return;
      released = true;
      const remaining = (this.leases.get(tabId) ?? 1) - 1;
      if (remaining > 0) {
        this.leases.set(tabId, remaining);
        return;
      }
      this.leases.delete(tabId);
      if (this.persistentTabs.has(tabId) || !this.attachedTabs.has(tabId)) return;
      if (this.pendingDialogs.has(tabId)) {
        this.persistentTabs.add(tabId);
        return;
      }
      this.attachedTabs.delete(tabId);
      await chrome.debugger.detach({ tabId }).catch(() => {});
    };
  }

  private async ensureAttached(tabId: number, persistent = false): Promise<void> {
    if (!this.attachedTabs.has(tabId)) {
      let pending = this.attaching.get(tabId);
      if (!pending) {
        pending = this.attach(tabId).finally(() => this.attaching.delete(tabId));
        this.attaching.set(tabId, pending);
      }
      await pending;
    }
    if (persistent) this.persistentTabs.add(tabId);
  }

  private async attach(tabId: number): Promise<void> {
    try {
      await chrome.debugger.attach({ tabId }, '1.3');
      this.attachedTabs.add(tabId);

      // Enable Page domain to receive dialog events
      await chrome.debugger.sendCommand({ tabId }, 'Page.enable');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Another debugger is already attached')) {
        throw new Error(
          'Cannot attach debugger: Chrome DevTools or another debugger is already attached to this tab. Close DevTools and try again.'
        );
      }
      throw err;
    }
  }

  private async waitForDialog(
    tabId: number,
    timeoutMs: number
  ): Promise<PendingDialog | null> {
    const existing = this.pendingDialogs.get(tabId);
    if (existing) return existing;

    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      await new Promise((r) => setTimeout(r, 100));
      const dialog = this.pendingDialogs.get(tabId);
      if (dialog) return dialog;
    }

    return null;
  }

  /**
   * Fallback: try Page.handleJavaScriptDialog directly.
   * If a dialog is open, this succeeds. If not, it fails gracefully.
   */
  private async tryHandleDirectly(
    tabId: number,
    params: HandleDialogParams
  ): Promise<HandleDialogResult> {
    try {
      const commandParams: { accept: boolean; promptText?: string } = {
        accept: params.action === 'accept',
      };
      if (params.promptText !== undefined) {
        commandParams.promptText = params.promptText;
      }

      await chrome.debugger.sendCommand(
        { tabId },
        'Page.handleJavaScriptDialog',
        commandParams
      );

      return {
        dialogType: undefined,
        message: undefined,
        defaultPrompt: undefined,
        handled: true,
      };
    } catch {
      return { handled: false };
    }
  }

  private async respondToDialog(
    tabId: number,
    dialog: PendingDialog,
    params: HandleDialogParams
  ): Promise<HandleDialogResult> {
    await this.ensureAttached(tabId, true);

    try {
      const commandParams: { accept: boolean; promptText?: string } = {
        accept: params.action === 'accept',
      };
      if (params.promptText !== undefined) {
        commandParams.promptText = params.promptText;
      }

      await chrome.debugger.sendCommand(
        { tabId },
        'Page.handleJavaScriptDialog',
        commandParams
      );

      this.pendingDialogs.delete(tabId);

      return {
        dialogType: dialog.type,
        message: dialog.message,
        defaultPrompt: dialog.defaultPrompt || undefined,
        handled: true,
      };
    } catch {
      // Dialog was likely already dismissed — clean up and report unhandled
      this.pendingDialogs.delete(tabId);
      return { handled: false };
    }
  }
}
