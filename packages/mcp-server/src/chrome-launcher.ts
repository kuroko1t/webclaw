/**
 * Platform-aware Chrome detection and launch utilities.
 *
 * Supports macOS, Linux (including WSL2), and Windows.
 * On all platforms, launches the local/native Chrome.
 */
import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { platform } from 'node:os';

const execAsync = promisify(exec);

/** Launch Chrome. Returns true if launch was attempted successfully. */
export async function launchChrome(): Promise<boolean> {
  try {
    const os = platform();

    if (os === 'darwin') {
      spawn('open', ['-a', 'Google Chrome'], {
        detached: true,
        stdio: 'ignore',
      }).unref();
      return true;
    }

    if (os === 'win32') {
      spawn('cmd.exe', ['/c', 'start', 'chrome'], {
        detached: true,
        stdio: 'ignore',
      }).unref();
      return true;
    }

    // Linux (including WSL2) — use the local Chrome
    const candidates = [
      'google-chrome',
      'google-chrome-stable',
      'chromium-browser',
      'chromium',
    ];
    for (const cmd of candidates) {
      try {
        await execAsync(`which ${cmd}`);
        spawn(cmd, [], { detached: true, stdio: 'ignore' }).unref();
        return true;
      } catch {
        continue;
      }
    }
    return false;
  } catch {
    return false;
  }
}
