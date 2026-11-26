import {
  createActionRegistry,
  registryTools,
  createToolServer,
  journalSinkFor,
  serveStdio,
  type JournalSink,
} from "@nones/mcp-core";
import { OpenCodeClient } from "./client";
import { toolActions } from "./tool-actions";
import { version } from "./version";

export interface OpenCodeServerOptions {
  /** Trusted injected sink; omit for a non-journaling bridge (module path). */
  journal?: JournalSink | null;
}

/**
 * Builds the native OpenCode MCP server through the shared core constructors.
 * Discovery, schemas, annotations, guards, steer, history and events keep their
 * original implementations; protocol registration and journaling live in core.
 */
export async function createServer(
  client: OpenCodeClient,
  options: OpenCodeServerOptions = {},
) {
  const operations = await client.operations();
  const registry = createActionRegistry(
    "opencode",
    toolActions(client, operations),
  );
  return createToolServer({
    name: "opencode-mcp",
    version,
    capabilities: { tools: { listChanged: true } },
    tools: registryTools(registry),
    journal: options.journal ?? null,
  });
}

/** Runs the stdio server and owns the configured journal sink. */
export async function startStdioServer(client: OpenCodeClient): Promise<void> {
  const journal = journalSinkFor({ env: process.env, cwd: process.cwd() });
  try {
    const server = await createServer(client, { journal });
    await serveStdio(server, { onClose: () => journal.close() });
  } catch (error) {
    await journal.close();
    throw error;
  }
}
