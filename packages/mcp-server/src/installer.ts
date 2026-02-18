/**
 * WebClaw installer.
 *
 * Registers the Native Messaging host manifest and outputs
 * Claude Desktop configuration.
 */
import { writeFileSync, mkdirSync, existsSync, chmodSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { platform, env } from 'node:process';
import { fileURLToPath } from 'node:url';
import { NATIVE_MESSAGING_HOST } from '@webclaw/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function install(): Promise<void> {
  console.log('WebClaw Installer');
  console.log('=================\n');

  // 1. Register Native Messaging Host
  registerNativeMessagingHost();

  // 2. Output Claude Desktop config
  outputClaudeDesktopConfig();

  console.log('\nInstallation complete!');
}

function registerNativeMessagingHost(): void {
  const hostPath = resolve(__dirname, 'cli.js');

  const manifest = {
    name: NATIVE_MESSAGING_HOST,
    description: 'WebClaw Native Messaging Bridge',
    path: getHostWrapperPath(),
    type: 'stdio',
    allowed_origins: [] as string[],
  };

  // Create wrapper script
  createHostWrapper(hostPath);

  // Determine manifest location
  const manifestDir = getNativeMessagingManifestDir();
  const manifestPath = resolve(manifestDir, `${NATIVE_MESSAGING_HOST}.json`);

  mkdirSync(manifestDir, { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`Native Messaging host manifest written to:\n  ${manifestPath}`);
  console.log(
    '\nNote: Update "allowed_origins" with your extension ID after loading it.'
  );
  console.log(
    `  Example: "chrome-extension://YOUR_EXTENSION_ID/"`
  );
}

function getNativeMessagingManifestDir(): string {
  const home = env.HOME ?? env.USERPROFILE ?? '';

  switch (platform) {
    case 'darwin':
      return resolve(
        home,
        'Library/Application Support/Google/Chrome/NativeMessagingHosts'
      );
    case 'linux':
      return resolve(home, '.config/google-chrome/NativeMessagingHosts');
    case 'win32':
      // Windows uses registry, but we put manifest alongside for reference
      return resolve(
        env.LOCALAPPDATA ?? resolve(home, 'AppData/Local'),
        'Google/Chrome/User Data/NativeMessagingHosts'
      );
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

function getHostWrapperPath(): string {
  const home = env.HOME ?? env.USERPROFILE ?? '';

  switch (platform) {
    case 'win32':
      return resolve(home, '.webclaw', 'webclaw-host.bat');
    default:
      return resolve(home, '.webclaw', 'webclaw-host.sh');
  }
}

function createHostWrapper(hostPath: string): void {
  const wrapperPath = getHostWrapperPath();
  const wrapperDir = dirname(wrapperPath);

  mkdirSync(wrapperDir, { recursive: true });

  if (platform === 'win32') {
    writeFileSync(wrapperPath, `@echo off\r\nnode "${hostPath}" %*\r\n`);
  } else {
    writeFileSync(
      wrapperPath,
      `#!/bin/sh\nexec node "${hostPath}" "$@"\n`
    );
    chmodSync(wrapperPath, 0o755);
  }

  console.log(`Host wrapper script written to:\n  ${wrapperPath}`);
}

function outputClaudeDesktopConfig(): void {
  const config = {
    mcpServers: {
      webclaw: {
        command: 'npx',
        args: ['-y', 'webclaw'],
      },
    },
  };

  console.log('\nClaude Desktop configuration:');
  console.log('Add the following to your claude_desktop_config.json:\n');
  console.log(JSON.stringify(config, null, 2));

  // Determine config file location
  const home = env.HOME ?? env.USERPROFILE ?? '';
  let configPath: string;

  switch (platform) {
    case 'darwin':
      configPath = resolve(
        home,
        'Library/Application Support/Claude/claude_desktop_config.json'
      );
      break;
    case 'linux':
      configPath = resolve(home, '.config/Claude/claude_desktop_config.json');
      break;
    case 'win32':
      configPath = resolve(
        env.APPDATA ?? resolve(home, 'AppData/Roaming'),
        'Claude/claude_desktop_config.json'
      );
      break;
    default:
      configPath = 'claude_desktop_config.json';
  }

  console.log(`\nConfig file location:\n  ${configPath}`);
}
