import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  createToolServer,
  journalSinkFor,
  serveStdio,
  type JournalSink,
  type ToolServerEntry,
} from '@nones/mcp-core';
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
 * Builds the standalone MCP server through the shared core transport. Tool
 * registration, schema conversion and the middleware chain still come from
 * `createToolRuntime`; timing, result classification and journaling come from
 * `@nones/mcp-core`.
 */
export function createMcpServer(options: { journal?: JournalSink | null } = {}) {
  let sdk: KaitenSDK | null = null;
  const runtime = createToolRuntime({
    version: readVersion(),
    config: loadConfigLenient(),
    inspect: inspectConfig,
    getSdk: () => {
      if (!sdk) sdk = new KaitenSDK();
      return sdk;
    },
  });

  const tools: ToolServerEntry[] = runtime.definitions.map((definition) => ({
    definition,
    integration: 'kaiten',
    call: async (args) => runtime.call(definition.name, args),
  }));

  return createToolServer({
    name: SERVER_NAME,
    version: readVersion(),
    capabilities: { tools: { listChanged: true } },
    tools,
    journal: options.journal ?? null,
  });
}

export async function startMcpServer(): Promise<void> {
  console.error(`MCP Server starting with log level: ${getLogLevel()}`);
  const journal = journalSinkFor({ env: process.env, cwd: process.cwd() });
  try {
    const server = createMcpServer({ journal });
    await serveStdio(server, { onClose: () => journal.close() });
  } catch (error) {
    await journal.close();
    throw error;
  }
}
