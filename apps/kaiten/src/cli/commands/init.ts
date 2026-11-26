import type { CliCommand } from '../../interfaces';
import { loadConfig } from '../../kaiten';
import { saveGlobalCredentials } from '../../lib/config-init';

export const initCommand: CliCommand = {
  name: 'init',
  async run() {
    const config = loadConfig();
    const filePath = saveGlobalCredentials({
      apiUrl: config.apiUrl,
      apiToken: config.apiToken,
    });
    console.log(`Kaiten credentials saved to ${filePath} (mode 0600).`);
    console.log('MCP can now start with: npx -y @nones/kaiten-mcp mcp');
  },
};
