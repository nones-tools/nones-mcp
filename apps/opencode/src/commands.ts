import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { OpenCodeClient } from "./client";
import { formatJson } from "./json";
import { recordJournaledOperation } from "./journal/cli-action";
import { createServer } from "./server";
import { ServiceStartError } from "./service-errors";
import { createMcpProbe } from "./service-probe";
import { startService } from "./service-start";

/** Run the stdio MCP server against an already running OpenCode service. */
export async function runMcp(): Promise<void> {
  const client = await OpenCodeClient.connect();
  const server = await createServer(client);
  await server.connect(new StdioServerTransport());
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

/**
 * Ensure the managed service is running and MCP-ready, then print a
 * credential-free ready result. This is the only command that may launch
 * `opencode2 service start`; `mcp` and `doctor` remain observe-only.
 */
export interface ServerStartOptions {
  cliPath: string;
  timeoutSeconds?: number | string;
  opencodeBin?: string;
}

export async function runServerStart(
  options: ServerStartOptions,
): Promise<void> {
  const probe = createMcpProbe({
    command: process.execPath,
    args: [options.cliPath],
    cwd: process.cwd(),
  });
  const startedAt = Date.now();
  let result: Awaited<ReturnType<typeof startService>>;
  try {
    result = await startService({
      timeoutSeconds: options.timeoutSeconds,
      opencodeBin: options.opencodeBin,
      probe,
    });
  } catch (error) {
    await recordJournaledOperation({
      operation: "opencode.service.start",
      outcome: "failure",
      startedAt,
      endedAt: Date.now(),
    });
    throw error;
  }
  const endedAt = Date.now();
  console.log(formatJson(result));
  await recordJournaledOperation({
    operation: "opencode.service.start",
    outcome: "success",
    startedAt,
    endedAt,
  });
}

function failureCode(error: unknown): number {
  if (error instanceof ServiceStartError) {
    if (error.code === "canceled") return 130;
    if (error.code === "mcp-timeout" || error.code === "native-start-timeout")
      return 124;
  }
  return 1;
}

/**
 * Run one command, keep runtime failures on stderr with a nonzero exit, and
 * honor explicit exit codes such as monitor timeout (124) or signal (130).
 */
export async function runCommand(
  run: () => MaybePromise<number | void>,
): Promise<void> {
  try {
    const code = await run();
    if (typeof code === "number") process.exitCode = code;
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "OpenCode command failed",
    );
    process.exitCode = failureCode(error);
  }
}

export async function reportFailures(run: () => Promise<void>): Promise<void> {
  await runCommand(run);
}
