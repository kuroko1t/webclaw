/**
 * WebClaw installer.
 *
 * Outputs Claude Desktop configuration.
 */
import { resolve } from 'node:path';
import { platform, env } from 'node:process';
import { WEBSOCKET_DEFAULT_PORT, WEBSOCKET_PORT_ENV } from 'webclaw-shared';

export async function install(): Promise<void> {
  console.log('WebClaw Installer');
  console.log('=================\n');

  outputClaudeDesktopConfig();

  console.log(`\nWebSocket port: ${WEBSOCKET_DEFAULT_PORT} (override with ${WEBSOCKET_PORT_ENV} env var)`);
  console.log('\nInstallation complete!');
}

function outputClaudeDesktopConfig(): void {
  const config = {
    mcpServers: {
      webclaw: {
        command: 'npx',
        args: ['-y', 'webclaw-mcp'],
      },
    },
  };

  console.log('Claude Desktop configuration:');
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
