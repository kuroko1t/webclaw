/**
 * Platform-aware Chrome detection and launch utilities.
 *
 * Supports macOS, Linux (including WSL2), and Windows.
 * On all platforms, launches the local/native Chrome.
 */
import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { readdirSync } from 'node:fs';
import { platform } from 'node:os';
import { CHROME_PROFILE_ENV } from 'webclaw-shared';

const execAsync = promisify(exec);

/**
 * Chrome flags used for every launch.
 *
 * With more than one profile in the browser, Chrome may stop at the profile
 * picker and never reach a page, so the extension never connects. Set
 * WEBCLAW_CHROME_PROFILE to a profile directory name (e.g. "Default" or
 * "Profile 1") to open that profile directly. When unset or empty, no flag is
 * passed and Chrome decides as before.
 */
export function chromeLaunchArgs(): string[] {
  const profile = process.env[CHROME_PROFILE_ENV]?.trim();
  return profile ? [`--profile-directory=${profile}`] : [];
}

/**
 * Environment for the Chrome process.
 *
 * MCP clients are not always started from a graphical session (systemd units,
 * WSL shells, remote sessions), so DISPLAY may be missing even though an X
 * server is running — Chrome then exits immediately with "Missing X server or
 * $DISPLAY". Fall back to the lowest-numbered X socket that is present.
 */
export function chromeLaunchEnv(): NodeJS.ProcessEnv {
  if (platform() !== 'linux') return process.env;
  if (process.env.DISPLAY || process.env.WAYLAND_DISPLAY) return process.env;

  let display: string | null = null;
  try {
    const sockets = readdirSync('/tmp/.X11-unix')
      .filter((name) => /^X\d+$/.test(name))
      .map((name) => Number(name.slice(1)))
      .sort((a, b) => a - b);
    if (sockets.length > 0) display = `:${sockets[0]}`;
  } catch {
    // No X socket directory — leave the environment untouched.
  }
  return display === null ? process.env : { ...process.env, DISPLAY: display };
}

/** Launch Chrome. Returns true if launch was attempted successfully. */
export async function launchChrome(): Promise<boolean> {
  try {
    const os = platform();
    const args = chromeLaunchArgs();
    const env = chromeLaunchEnv();

    if (os === 'darwin') {
      spawn('open', ['-a', 'Google Chrome', ...(args.length > 0 ? ['--args', ...args] : [])], {
        detached: true,
        stdio: 'ignore',
      }).unref();
      return true;
    }

    if (os === 'win32') {
      spawn('cmd.exe', ['/c', 'start', 'chrome', ...args], {
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
        spawn(cmd, args, { detached: true, stdio: 'ignore', env }).unref();
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
