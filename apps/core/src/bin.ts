#!/usr/bin/env node
import { createRequire } from "node:module";
import { Command } from "commander";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { loadConfig } from "./config";
import { JournalSink, registerJournalCommands } from "./journal/index";
import { createLogger } from "./logger";
import { ModuleHost } from "./modules";
import { createServer, SERVER_NAME } from "./server";

const USAGE = `Usage: ${SERVER_NAME} [command]

Commands:
  (none)     serve stdio MCP (stdout carries JSON-RPC only)
  doctor     print loaded config and module readiness as JSON
  journal    read the local operation journal (list, stats)
  --version  print the core version
  --help     print this help
`;

function version(): string {
  try {
    const pkg = createRequire(import.meta.url)("../package.json") as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

async function serve(): Promise<void> {
  const loaded = await loadConfig();
  const logger = createLogger(loaded.shared.logLevel, loaded.secrets);
  for (const warning of loaded.warnings) logger.warn(warning);
  const journal = new JournalSink({ settings: loaded.journal, logger });
  const host = await ModuleHost.start(loaded, logger);
  const server = createServer(host, journal);
  const transport = new StdioServerTransport();
  let closing = false;
  const shutdown = async (reason: string): Promise<void> => {
    if (closing) return;
    closing = true;
    logger.info("shutting down", { reason });
    await host.close();
    await server.close();
    await journal.close();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  transport.onclose = () => void shutdown("transport closed");
  await server.connect(transport);
}

async function doctor(): Promise<void> {
  const loaded = await loadConfig();
  const report = {
    name: SERVER_NAME,
    version: version(),
    configDirectory: loaded.directory,
    modules: loaded.modules.map((entry) => ({
      id: entry.id,
      enabled: entry.config.enabled,
      stateDir: `${loaded.directory}/state/${entry.id}`,
    })),
    journal: {
      enabled: loaded.journal.enabled,
      capturePrompts: loaded.journal.capturePrompts,
      adapter: loaded.journal.adapter?.module ?? "sqlite",
      sqlitePath: loaded.journal.sqlitePath,
      opened: false,
      policy: "one metadata record per real MCP tools/call or dispatched CLI command",
    },
    warnings: loaded.warnings,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

async function journal(): Promise<void> {
  const program = new Command()
    .name(SERVER_NAME)
    .description("read the local operation journal");
  registerJournalCommands(program);
  await program.parseAsync(process.argv.slice(2), { from: "user" });
}

async function main(): Promise<void> {
  const [command] = process.argv.slice(2);
  if (command === "--help" || command === "-h" || command === "help") {
    process.stdout.write(USAGE);
    return;
  }
  if (command === "--version" || command === "-V") {
    process.stdout.write(`${version()}\n`);
    return;
  }
  if (command === "doctor") {
    await doctor();
    return;
  }
  if (command === "journal") {
    await journal();
    return;
  }
  if (command !== undefined) {
    process.stderr.write(USAGE);
    process.exitCode = 2;
    return;
  }
  await serve();
}

main().catch((error: unknown) => {
  process.stderr.write(
    `nones-mcp failed to start: ${error instanceof Error ? error.message : "unknown error"}\n`,
  );
  process.exit(1);
});
