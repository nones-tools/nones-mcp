import { OpenCodeClient } from "./client";
import { formatJson } from "./json";
import { startStdioServer } from "./server";
import { ServiceStartError } from "./service-errors";
import { createMcpProbe } from "./service-probe";
import { startService } from "./service-start";

/** Run the stdio MCP server against an already running OpenCode service. */
export async function runMcp(): Promise<void> {
  const client = await OpenCodeClient.connect();
  await startStdioServer(client);
}

/** Print a credential-free health report as indented JSON on stdout. */
export async function runDoctor(): Promise<void> {
  const client = await OpenCodeClient.connect();
  const operations = await client.operations();
  const info = await client.request({ operation: "server.info" });
  console.log(
    formatJson({
      healthy: true,
      info,
      operations: operations.length,
    }),
  );
}

export interface ServerStartOptions {
  cliPath: string;
  timeoutSeconds?: number | string;
  opencodeBin?: string;
}

/**
 * Ensure the managed service is running and MCP-ready, then print a
 * credential-free ready result. Journaling is handled by the caller.
 */
export async function runServerStart(
  options: ServerStartOptions,
): Promise<void> {
  const probe = createMcpProbe({
    command: process.execPath,
    args: [options.cliPath],
    cwd: process.cwd(),
  });
  const result = await startService({
    timeoutSeconds: options.timeoutSeconds,
    opencodeBin: options.opencodeBin,
    probe,
  });
  console.log(formatJson(result));
}

/** Native exit code for a failed server-start command. */
export function failureCode(error: unknown): number {
  if (error instanceof ServiceStartError) {
    if (error.code === "canceled") return 130;
    if (error.code === "mcp-timeout" || error.code === "native-start-timeout")
      return 124;
  }
  return 1;
}
