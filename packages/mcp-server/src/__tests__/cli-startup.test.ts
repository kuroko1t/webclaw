import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(__dirname, '../../dist/cli.js');

describe('MCP Server stdio startup', () => {
  it('starts and can be terminated cleanly', async () => {
    const child = spawn('node', [cliPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
      env: { ...process.env, WEBCLAW_PORT: '19070' },
    });

    let stderr = '';

    // Wait for the startup message or timeout
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => resolve(), 5000);
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
        if (stderr.includes('MCP Server started')) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });

    // Process should still be running
    expect(child.exitCode).toBeNull();

    // Kill it
    child.kill('SIGTERM');

    const exitCode = await new Promise<number | null>((resolve) => {
      child.on('exit', (code) => resolve(code));
      setTimeout(() => resolve(null), 3000);
    });

    // Should have started (stderr contains startup message)
    expect(stderr).toContain('MCP Server started');
  });

  it('shows help with --help flag', async () => {
    const child = spawn('node', [cliPath, '--help'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const exitCode = await new Promise<number | null>((resolve) => {
      child.on('exit', (code) => resolve(code));
      setTimeout(() => {
        child.kill();
        resolve(null);
      }, 3000);
    });

    const output = stdout + stderr;
    expect(output).toContain('webclaw');
  });

  it('exits cleanly when the MCP client closes stdin', async () => {
    const child = spawn('node', [cliPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 15000,
      env: { ...process.env, WEBCLAW_PORT: '28080' },
    });

    try {
      let stderr = '';
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Startup timed out. stderr: ${stderr}`)), 10000);
        child.stderr?.on('data', (chunk: Buffer) => {
          stderr += chunk.toString();
          if (stderr.includes('MCP Server started')) {
            clearTimeout(timeout);
            resolve();
          }
        });
      });

      const exited = new Promise<number | null>((resolve) => {
        child.on('exit', (code) => resolve(code));
      });
      child.stdin!.end();

      const exitCode = await Promise.race([
        exited,
        new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 5000)),
      ]);

      expect(exitCode).toBe(0);
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    }
  }, 20000);
});
