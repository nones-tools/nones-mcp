#!/usr/bin/env node
import { Command } from "commander";
import { reportFailures, runDoctor, runMcp } from "./commands";
import { version } from "./version";

const program = new Command()
  .name("opencode-mcp")
  .description("MCP server and diagnostics for an existing OpenCode service")
  .version(version, "-V, --version", "print the CLI and MCP server version");

program
  .command("mcp")
  .description("run the stdio MCP server (default when no command is given)")
  .addHelpText(
    "after",
    "\nstdout carries JSON-RPC messages only; send diagnostics to stderr.\nExample:\n  $ opencode-mcp mcp",
  )
  .action(() => reportFailures(runMcp));

program
  .command("doctor")
  .description("check the OpenCode connection and print a health report")
  .addHelpText(
    "after",
    "\nPrints indented JSON with healthy, info, and operations; credentials are never included.\nExample:\n  $ opencode-mcp doctor",
  )
  .action(() => reportFailures(runDoctor));

const args = process.argv.slice(2);
await program.parseAsync(args.length ? args : ["mcp"], { from: "user" });
