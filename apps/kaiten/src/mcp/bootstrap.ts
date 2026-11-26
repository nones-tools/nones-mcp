import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { inspectConfig, loadConfigLenient } from '../kaiten';
import { KaitenSDK } from '../sdk';
import { getLogLevel } from './logger';
import { createToolRuntime } from './tool-runtime';

const SERVER_NAME = 'kaiten-mcp';

/**
 * Version comes from package.json at runtime (not a hardcoded literal) so
 * it can never drift from the published npm version. Read via `fs` rather
 * than a JSON import: this code runs as TS source under `bun` and bundled
 * under plain Node; `../../package.json` resolves to the package root in
 * src/mcp/, dist/mcp/ and dist/cli/ alike.
 */
export function readVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(join(here, '../../package.json'), 'utf-8')) as { version: string };
  return pkg.version;
}

/**
 * Builds the standalone MCP server. Tool registration, schema conversion and
 * the middleware chain all come from `createToolRuntime` - the same
 * implementation the source-owned module export uses.
 */
export function createMcpServer(): Server {
  let sdk: KaitenSDK | null = null;
  const server = new Server(
    { name: SERVER_NAME, version: readVersion() },
    { capabilities: { tools: { listChanged: true } } }
  );

  const runtime = createToolRuntime({
    version: readVersion(),
    config: loadConfigLenient(),
    inspect: inspectConfig,
    getSdk: () => {
      if (!sdk) sdk = new KaitenSDK();
      return sdk;
    },
  });

  // Low-level registration is intentional: McpServer.registerTool() in SDK
  // 1.29.0 hardcodes `taskSupport: forbidden`, which hides tools from Codex
  // task chats. These handlers preserve the same schemas and middleware.
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: runtime.definitions }));
  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    runtime.call(request.params.name, request.params.arguments ?? {})
  );

  return server;
}

export async function startMcpServer(): Promise<void> {
  console.error(`MCP Server starting with log level: ${getLogLevel()}`);
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
