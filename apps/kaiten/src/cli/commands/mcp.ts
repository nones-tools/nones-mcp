import type { CliCommand } from '../../interfaces';

/**
 * Starts the stdio MCP server in-process. The dynamic import keeps the MCP
 * adapter (58 tool definitions and their zod schemas) out of the CLI startup
 * path - every other command stays as fast as before. stdout belongs to the
 * MCP protocol from this point on; the bootstrap only writes diagnostics to
 * stderr, so the CLI must not print anything here either.
 */
export const mcpCommand: CliCommand = {
  name: 'mcp',
  async run() {
    const { startMcpServer } = await import('../../mcp/bootstrap');
    await startMcpServer();
  },
};
