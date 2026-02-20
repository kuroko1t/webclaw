/**
 * Tests for chrome-launcher.ts.
 *
 * Mocks child_process to test platform-specific launch logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as childProcess from 'node:child_process';
import * as os from 'node:os';

// Mock modules before importing the tested module
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('node:os', () => ({
  platform: vi.fn(),
}));

// Import after mocking
const { launchChrome } = await import('../chrome-launcher.js');

const mockExec = vi.mocked(childProcess.exec);
const mockSpawn = vi.mocked(childProcess.spawn);
const mockPlatform = vi.mocked(os.platform);

/** Helper to create a mock spawned process. */
function mockSpawnProcess(): void {
  mockSpawn.mockReturnValue({
    unref: vi.fn(),
  } as any);
}

beforeEach(() => {
  vi.clearAllMocks();
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

    // First which call succeeds
    mockExec.mockImplementation((...args: any[]) => {
      const cb = args[args.length - 1];
      if (typeof cb === 'function') cb(null, { stdout: '/usr/bin/google-chrome\n', stderr: '' });
      return {} as any;
    });

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
});
