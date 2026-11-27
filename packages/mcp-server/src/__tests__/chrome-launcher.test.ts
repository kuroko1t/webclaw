/**
 * Tests for chrome-launcher.ts.
 *
 * Mocks child_process to test platform-specific launch logic.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import * as childProcess from 'node:child_process';
import * as os from 'node:os';
import * as fs from 'node:fs';

// Mock modules before importing the tested module
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('node:os', () => ({
  platform: vi.fn(),
}));

vi.mock('node:fs', () => ({
  readdirSync: vi.fn(),
}));

// Import after mocking
const { launchChrome, chromeLaunchArgs, chromeLaunchEnv } = await import('../chrome-launcher.js');

const mockExec = vi.mocked(childProcess.exec);
const mockSpawn = vi.mocked(childProcess.spawn);
const mockPlatform = vi.mocked(os.platform);
const mockReaddir = vi.mocked(fs.readdirSync);

/** Helper to create a mock spawned process. */
function mockSpawnProcess(): void {
  mockSpawn.mockReturnValue({
    unref: vi.fn(),
  } as any);
}

/** Helper to make every `which` lookup succeed. */
function mockWhichFound(): void {
  mockExec.mockImplementation((...args: any[]) => {
    const cb = args[args.length - 1];
    if (typeof cb === 'function') cb(null, { stdout: '/usr/bin/google-chrome\n', stderr: '' });
    return {} as any;
  });
}

const ENV_KEYS = ['WEBCLAW_CHROME_PROFILE', 'DISPLAY', 'WAYLAND_DISPLAY'] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ENV_KEYS) delete process.env[key];
  mockReaddir.mockReturnValue([] as any);
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe('launchChrome', () => {
  it('launches Chrome on macOS with open -a', async () => {
    mockPlatform.mockReturnValue('darwin');
    mockSpawnProcess();

    const result = await launchChrome();
    expect(result).toBe(true);
    expect(mockSpawn).toHaveBeenCalledWith(
      'open',
      ['-a', 'Google Chrome'],
      expect.objectContaining({ detached: true, stdio: 'ignore' })
    );
  });

  it('launches Chrome on Windows with cmd.exe', async () => {
    mockPlatform.mockReturnValue('win32');
    mockSpawnProcess();

    const result = await launchChrome();
    expect(result).toBe(true);
    expect(mockSpawn).toHaveBeenCalledWith(
      'cmd.exe',
      ['/c', 'start', 'chrome'],
      expect.objectContaining({ detached: true })
    );
  });

  it('launches Chrome on Linux by finding executable', async () => {
    mockPlatform.mockReturnValue('linux');
    mockSpawnProcess();
    mockWhichFound();

    const result = await launchChrome();
    expect(result).toBe(true);
    expect(mockSpawn).toHaveBeenCalledWith(
      'google-chrome',
      [],
      expect.objectContaining({ detached: true })
    );
  });

  it('tries multiple candidates on Linux', async () => {
    mockPlatform.mockReturnValue('linux');
    mockSpawnProcess();

    let callCount = 0;
    mockExec.mockImplementation((...args: any[]) => {
      const cb = args[args.length - 1];
      callCount++;
      if (typeof cb === 'function') {
        if (callCount <= 2) {
          // First two candidates not found
          cb(new Error('not found'), { stdout: '', stderr: '' });
        } else {
          // Third candidate found (chromium-browser)
          cb(null, { stdout: '/usr/bin/chromium-browser\n', stderr: '' });
        }
      }
      return {} as any;
    });

    const result = await launchChrome();
    expect(result).toBe(true);
    expect(mockSpawn).toHaveBeenCalledWith(
      'chromium-browser',
      [],
      expect.objectContaining({ detached: true })
    );
  });

  it('returns false on Linux when no Chrome executable found', async () => {
    mockPlatform.mockReturnValue('linux');

    // All which calls fail
    mockExec.mockImplementation((...args: any[]) => {
      const cb = args[args.length - 1];
      if (typeof cb === 'function') cb(new Error('not found'), { stdout: '', stderr: '' });
      return {} as any;
    });

    const result = await launchChrome();
    expect(result).toBe(false);
  });

  it('passes WEBCLAW_CHROME_PROFILE on macOS via --args', async () => {
    mockPlatform.mockReturnValue('darwin');
    mockSpawnProcess();
    process.env.WEBCLAW_CHROME_PROFILE = 'Default';

    await launchChrome();
    expect(mockSpawn).toHaveBeenCalledWith(
      'open',
      ['-a', 'Google Chrome', '--args', '--profile-directory=Default'],
      expect.objectContaining({ detached: true, stdio: 'ignore' })
    );
  });

  it('passes WEBCLAW_CHROME_PROFILE on Windows', async () => {
    mockPlatform.mockReturnValue('win32');
    mockSpawnProcess();
    process.env.WEBCLAW_CHROME_PROFILE = 'Default';

    await launchChrome();
    expect(mockSpawn).toHaveBeenCalledWith(
      'cmd.exe',
      ['/c', 'start', 'chrome', '--profile-directory=Default'],
      expect.objectContaining({ detached: true })
    );
  });

  it('passes WEBCLAW_CHROME_PROFILE with spaces on Linux as a single argument', async () => {
    mockPlatform.mockReturnValue('linux');
    mockSpawnProcess();
    mockWhichFound();
    process.env.WEBCLAW_CHROME_PROFILE = 'Profile 1';

    await launchChrome();
    expect(mockSpawn).toHaveBeenCalledWith(
      'google-chrome',
      ['--profile-directory=Profile 1'],
      expect.objectContaining({ detached: true })
    );
  });

  it('passes the X display fallback to Chrome on Linux', async () => {
    mockPlatform.mockReturnValue('linux');
    mockSpawnProcess();
    mockWhichFound();
    mockReaddir.mockReturnValue(['X1'] as any);

    await launchChrome();
    expect(mockSpawn).toHaveBeenCalledWith(
      'google-chrome',
      [],
      expect.objectContaining({ env: expect.objectContaining({ DISPLAY: ':1' }) })
    );
  });
});

describe('chromeLaunchArgs', () => {
  it('returns no flags when WEBCLAW_CHROME_PROFILE is unset', () => {
    expect(chromeLaunchArgs()).toEqual([]);
  });

  it('returns no flags when WEBCLAW_CHROME_PROFILE is empty', () => {
    process.env.WEBCLAW_CHROME_PROFILE = '';
    expect(chromeLaunchArgs()).toEqual([]);
  });

  it('returns no flags when WEBCLAW_CHROME_PROFILE is only whitespace', () => {
    process.env.WEBCLAW_CHROME_PROFILE = '   ';
    expect(chromeLaunchArgs()).toEqual([]);
  });

  it('adds --profile-directory when WEBCLAW_CHROME_PROFILE is set', () => {
    process.env.WEBCLAW_CHROME_PROFILE = 'Default';
    expect(chromeLaunchArgs()).toEqual(['--profile-directory=Default']);
  });

  it('keeps spaces inside the profile directory name', () => {
    process.env.WEBCLAW_CHROME_PROFILE = 'Profile 1';
    expect(chromeLaunchArgs()).toEqual(['--profile-directory=Profile 1']);
  });
});

describe('chromeLaunchEnv', () => {
  it('leaves the environment untouched off Linux', () => {
    mockPlatform.mockReturnValue('darwin');
    expect(chromeLaunchEnv()).toBe(process.env);
    expect(mockReaddir).not.toHaveBeenCalled();
  });

  it('leaves the environment untouched when DISPLAY is already set', () => {
    mockPlatform.mockReturnValue('linux');
    mockReaddir.mockReturnValue(['X0'] as any);
    process.env.DISPLAY = ':5';
    expect(chromeLaunchEnv()).toBe(process.env);
    expect(mockReaddir).not.toHaveBeenCalled();
  });

  it('leaves the environment untouched when WAYLAND_DISPLAY is set', () => {
    mockPlatform.mockReturnValue('linux');
    mockReaddir.mockReturnValue(['X0'] as any);
    process.env.WAYLAND_DISPLAY = 'wayland-0';
    expect(chromeLaunchEnv()).toBe(process.env);
    expect(mockReaddir).not.toHaveBeenCalled();
  });

  it('falls back to the lowest X socket when DISPLAY is missing', () => {
    mockPlatform.mockReturnValue('linux');
    mockReaddir.mockReturnValue(['X7', 'X0', '.lock'] as any);
    expect(chromeLaunchEnv().DISPLAY).toBe(':0');
  });

  it('sorts X sockets numerically, not lexicographically', () => {
    mockPlatform.mockReturnValue('linux');
    mockReaddir.mockReturnValue(['X10', 'X2'] as any);
    expect(chromeLaunchEnv().DISPLAY).toBe(':2');
  });

  it('ignores entries that are not X sockets', () => {
    mockPlatform.mockReturnValue('linux');
    mockReaddir.mockReturnValue(['.X0-lock', 'Xfoo'] as any);
    expect(chromeLaunchEnv()).toBe(process.env);
  });

  it('leaves the environment untouched when no X socket exists', () => {
    mockPlatform.mockReturnValue('linux');
    mockReaddir.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(chromeLaunchEnv()).toBe(process.env);
  });
});
