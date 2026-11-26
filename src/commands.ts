import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { OpenCodeClient } from "./client";
import { formatJson } from "./json";
import { createServer } from "./server";

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
    process.exitCode = 1;
  }
}

export async function reportFailures(run: () => Promise<void>): Promise<void> {
  await runCommand(run);
}
