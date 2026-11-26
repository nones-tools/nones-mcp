import type { Command } from "commander";
import {
  createActionRegistry,
  createCommanderProgram,
  registerJournalCommands,
} from "@nones/mcp-core";
import { coreActions } from "./cli-actions-core";
import { observeActions } from "./cli-actions-observe";
import { sessionActions } from "./cli-actions-session";
import { failureCode } from "./commands";
import { version } from "./version";

/** Builds the toolkit CLI; stdout carries output or MCP protocol only. */
export function createCliProgram(cliPath: string): Command {
  const registry = createActionRegistry("opencode", [
    ...coreActions(cliPath),
    ...sessionActions(),
    ...observeActions(),
  ]);
  const program = createCommanderProgram(registry, {
    name: "opencode-mcp",
    description:
      "MCP server, session CLI, and diagnostics for an existing OpenCode service",
    version,
    onError: (error) => {
      console.error(
        error instanceof Error ? error.message : "OpenCode command failed",
      );
      process.exitCode = failureCode(error);
    },
  });
  registerJournalCommands(program);
  return program;
}
