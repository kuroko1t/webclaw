/**
 * Side Panel - Real-time display of agent tool call activity.
 */

const logContainer = document.getElementById('logContainer')!;
const emptyState = document.getElementById('emptyState')!;
const statusEl = document.getElementById('status')!;
const clearBtn = document.getElementById('clearBtn')!;

let entries: LogEntry[] = [];

interface LogEntry {
  action: string;
  timestamp: number;
  url?: string;
  [key: string]: unknown;
}

// Listen for activity updates from service worker
chrome.runtime.onMessage.addListener((message) => {
  if (message.channel === 'webclaw-sidepanel-update' && message.type === 'activity') {
    addLogEntry(message.data as LogEntry);
  }
});

// Clear button
clearBtn.addEventListener('click', () => {
  entries = [];
  logContainer.innerHTML = '';
  emptyState.style.display = 'flex';
  logContainer.appendChild(emptyState);
});

function addLogEntry(entry: LogEntry): void {
  entries.push(entry);

  // Hide empty state
  if (emptyState.parentElement) {
    emptyState.style.display = 'none';
  }

  // Update status
  statusEl.textContent = 'Active';
  statusEl.classList.add('connected');

  // Create log element
  const el = document.createElement('div');
  el.className = `log-entry action-${entry.action}`;

  const time = new Date(entry.timestamp).toLocaleTimeString();

  let details = '';
  const detailKeys = Object.keys(entry).filter(
    (k) => !['action', 'timestamp', 'url'].includes(k)
  );
  if (detailKeys.length > 0) {
    const detailParts = detailKeys.map(
      (k) => `${k}: ${JSON.stringify(entry[k])}`
    );
    details = `<div class="details">${detailParts.join(' | ')}</div>`;
  }

  el.innerHTML = `
    <span class="timestamp">${time}</span>
    <span class="action-name">${entry.action}</span>
    ${details}
  `;

  logContainer.appendChild(el);
  el.scrollIntoView({ behavior: 'smooth' });
}
