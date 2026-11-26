import type { Command } from "commander";
import { formatJson } from "../json";
import { JournalError } from "./errors";
import { MAX_QUERY_LIMIT } from "./limits";
import { readJournalList, readJournalStats } from "./cli-reads";
import type { JournalFilter, JournalOutcome } from "./types";

export interface JournalCommandIO {
  out?: (text: string) => void;
  err?: (text: string) => void;
  setExitCode?: (code: number) => void;
  env?: Record<string, string | undefined>;
  cwd?: string;
}

interface FilterCommandOptions {
  operation?: string;
  operationPrefix?: string;
  outcome?: string;
  session?: string;
  from?: string;
  to?: string;
}

interface ListCommandOptions extends FilterCommandOptions {
  limit?: string;
  cursor?: string;
  includePrompts?: boolean;
}

function filterFrom(options: FilterCommandOptions): JournalFilter {
  const filter: JournalFilter = {};
  if (options.operation !== undefined) filter.operation = options.operation;
  if (options.operationPrefix !== undefined)
    filter.operationPrefix = options.operationPrefix;
  if (options.outcome !== undefined)
    filter.outcome = options.outcome as JournalOutcome;
  if (options.session !== undefined) filter.sessionId = options.session;
  if (options.from !== undefined) filter.from = options.from;
  if (options.to !== undefined) filter.to = options.to;
  return filter;
}

function limitFrom(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_QUERY_LIMIT)
    throw new JournalError(
      "validation",
      `limit must be an integer from 1 to ${MAX_QUERY_LIMIT}`,
    );
  return parsed;
}

function safeSummary(error: unknown): string {
  if (error instanceof JournalError) {
    if (
      error.code === "config" ||
      error.code === "validation" ||
      error.code === "cursor"
    )
      return error.message;
    if (error.code === "adapter") return "Journal adapter failed";
    if (error.code === "database") return "Journal database failed";
    if (error.code === "closed") return "Journal adapter is closed";
  }
  return "Journal command failed";
}

function execute(
  io: JournalCommandIO,
  run: () => Promise<string>,
): Promise<void> {
  return run().then(
    (text) => {
      (io.out ?? console.log)(text);
    },
    (error) => {
      (io.err ?? console.error)(safeSummary(error));
      (io.setExitCode ?? ((code: number) => (process.exitCode = code)))(1);
    },
  );
}

function addFilterOptions(command: Command): Command {
  return command
    .option("--operation <name>", "exact operation name")
    .option("--operation-prefix <prefix>", "operation name prefix")
    .option("--outcome <outcome>", "success, failure, or cancelled")
    .option("--session <id>", "native session ID")
    .option("--from <utc>", "inclusive UTC ISO timestamp")
    .option("--to <utc>", "exclusive UTC ISO timestamp");
}

/**
 * Registration is inert: no config read and no node:sqlite import until an action
 * runs. On Node 22 an enabled SQLite command may emit its built-in experimental
 * warning on stderr; this project does not suppress warnings. CLI tests should set
 * OPENCODE_MCP_CONFIG to a synthetic {"journal":{"enabled":false}} file.
 */
export function registerJournalCommands(
  program: Command,
  io: JournalCommandIO = {},
): void {
  const journal = program
    .command("journal")
    .description("read the local operation journal");

  const list = addFilterOptions(journal.command("list"))
    .description("list journal entries, newest first")
    .option("--limit <number>", "page size from 1 to 200")
    .option("--cursor <cursor>", "opaque cursor from a previous page")
    .option("--include-prompts", "include authorized prompt text")
    .addHelpText(
      "after",
      "\nPrompts are omitted unless --include-prompts is given.\n" +
        "Example:\n  $ opencode-mcp journal list --operation opencode.session.send --limit 20",
    );
  list.action((options: ListCommandOptions) =>
    execute(io, async () => {
      const page = await readJournalList({
        env: io.env,
        cwd: io.cwd,
        filter: filterFrom(options),
        limit: limitFrom(options.limit),
        cursor: options.cursor,
        includePrompts: options.includePrompts === true,
      });
      return formatJson(page);
    }),
  );

  const stats = addFilterOptions(journal.command("stats"))
    .description("print deterministic journal aggregates")
    .addHelpText(
      "after",
      "\nCounts and averages honor every filter; no prompts are printed.\n" +
        "Example:\n  $ opencode-mcp journal stats --operation-prefix opencode.session.",
    );
  stats.action((options: FilterCommandOptions) =>
    execute(io, async () => {
      const result = await readJournalStats({
        env: io.env,
        cwd: io.cwd,
        filter: filterFrom(options),
      });
      return formatJson(result);
    }),
  );
}
