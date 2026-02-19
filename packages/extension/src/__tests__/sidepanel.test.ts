import { describe, it, expect, beforeEach, vi } from 'vitest';

// jsdom doesn't implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

// Set up DOM before importing sidepanel
function setupDOM() {
  document.body.innerHTML = `
    <div id="logContainer">
      <div id="emptyState" style="display: flex">No activity</div>
    </div>
    <span id="status">Idle</span>
    <button id="clearBtn">Clear</button>
  `;
}

// Mock chrome.runtime.onMessage
const messageListeners: Function[] = [];
vi.stubGlobal('chrome', {
  runtime: {
    onMessage: {
      addListener: vi.fn((fn: Function) => messageListeners.push(fn)),
    },
  },
});

describe('sidepanel', () => {
  beforeEach(async () => {
    // Reset DOM
    setupDOM();
    messageListeners.length = 0;
    // Re-import the module to re-run top-level code
    vi.resetModules();
    await import('../sidepanel/sidepanel');
  });

  it('registers a message listener on load', () => {
    expect(messageListeners.length).toBeGreaterThan(0);
  });

  it('adds log entry on webclaw-sidepanel-update activity message', () => {
    const listener = messageListeners[0];
    listener({
      channel: 'webclaw-sidepanel-update',
      type: 'activity',
      data: {
        action: 'click',
        timestamp: Date.now(),
        ref: '@e1',
        success: true,
      },
    });

    const logContainer = document.getElementById('logContainer')!;
    const entries = logContainer.querySelectorAll('.log-entry');
    expect(entries.length).toBe(1);

    const actionName = entries[0].querySelector('.action-name');
    expect(actionName?.textContent).toBe('click');

    const details = entries[0].querySelector('.details');
    expect(details?.textContent).toContain('ref');
    expect(details?.textContent).toContain('@e1');
  });

  it('ignores non-matching messages', () => {
    const listener = messageListeners[0];
    listener({ channel: 'other', type: 'activity', data: {} });

    const logContainer = document.getElementById('logContainer')!;
    const entries = logContainer.querySelectorAll('.log-entry');
    expect(entries.length).toBe(0);
  });

  it('hides empty state on first entry', () => {
    const listener = messageListeners[0];
    const emptyState = document.getElementById('emptyState')!;
    expect(emptyState.style.display).toBe('flex');

    listener({
      channel: 'webclaw-sidepanel-update',
      type: 'activity',
      data: { action: 'snapshot', timestamp: Date.now() },
    });

    expect(emptyState.style.display).toBe('none');
  });

  it('updates status to Active', () => {
    const listener = messageListeners[0];
    const statusEl = document.getElementById('status')!;
    expect(statusEl.textContent).toBe('Idle');

    listener({
      channel: 'webclaw-sidepanel-update',
      type: 'activity',
      data: { action: 'snapshot', timestamp: Date.now() },
    });

    expect(statusEl.textContent).toBe('Active');
    expect(statusEl.classList.contains('connected')).toBe(true);
  });

  it('clear button removes all entries', () => {
    const listener = messageListeners[0];
    listener({
      channel: 'webclaw-sidepanel-update',
      type: 'activity',
      data: { action: 'click', timestamp: Date.now() },
    });

    const clearBtn = document.getElementById('clearBtn')!;
    clearBtn.click();

    const logContainer = document.getElementById('logContainer')!;
    const entries = logContainer.querySelectorAll('.log-entry');
    expect(entries.length).toBe(0);

    const emptyState = document.getElementById('emptyState')!;
    expect(emptyState.style.display).toBe('flex');
  });

  it('prevents XSS through action name', () => {
    const listener = messageListeners[0];
    listener({
      channel: 'webclaw-sidepanel-update',
      type: 'activity',
      data: {
        action: '<img src=x onerror=alert(1)>',
        timestamp: Date.now(),
      },
    });

    const logContainer = document.getElementById('logContainer')!;
    // The script tag should NOT be parsed as HTML
    expect(logContainer.innerHTML).not.toContain('<img');
    // It should be text content instead
    const actionName = logContainer.querySelector('.action-name');
    expect(actionName?.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('prevents XSS through detail values', () => {
    const listener = messageListeners[0];
    listener({
      channel: 'webclaw-sidepanel-update',
      type: 'activity',
      data: {
        action: 'click',
        timestamp: Date.now(),
        ref: '<script>alert("xss")</script>',
      },
    });

    const logContainer = document.getElementById('logContainer')!;
    expect(logContainer.innerHTML).not.toContain('<script>');
    const details = logContainer.querySelector('.details');
    expect(details?.textContent).toContain('<script>');
  });

  it('displays multiple log entries', () => {
    const listener = messageListeners[0];
    for (let i = 0; i < 5; i++) {
      listener({
        channel: 'webclaw-sidepanel-update',
        type: 'activity',
        data: { action: `action-${i}`, timestamp: Date.now() + i },
      });
    }

    const logContainer = document.getElementById('logContainer')!;
    const entries = logContainer.querySelectorAll('.log-entry');
    expect(entries.length).toBe(5);
  });

  it('excludes url from details display', () => {
    const listener = messageListeners[0];
    listener({
      channel: 'webclaw-sidepanel-update',
      type: 'activity',
      data: {
        action: 'snapshot',
        timestamp: Date.now(),
        url: 'http://example.com',
        snapshotId: 'snap-123',
      },
    });

    const details = document.querySelector('.details');
    expect(details?.textContent).not.toContain('url');
    expect(details?.textContent).toContain('snapshotId');
  });
});
