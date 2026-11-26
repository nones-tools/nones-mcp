#!/usr/bin/env node
import { Command, InvalidArgumentError } from "commander";
import { reportFailures, runCommand, runDoctor, runMcp } from "./commands";
import { runMonitorCommand } from "./monitor-cli";
import { runRun } from "./run-session";
import { runMessages, runSessions, runStatus } from "./session-read";
import { runSend, runStart } from "./session-start";
import { version } from "./version";

function limitValue(value: string): number {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200)
    throw new InvalidArgumentError("must be an integer from 1 to 200");
  return limit;
}

function secondsValue(value: string): number {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0)
    throw new InvalidArgumentError("must be a positive number of seconds");
  return seconds;
}

const program = new Command()
  .name("opencode-mcp")
  .description(
    "MCP server, session CLI, and diagnostics for an existing OpenCode service",
  )
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

program
  .command("start")
  .description("create a native session and submit a prompt with steer")
  .requiredOption("-C, --directory <path>", "working directory for the session")
  .requiredOption("-f, --file <file|->", "prompt file, or - for stdin")
  .option("--model <provider/id[#variant]>", "native model override")
  .option("--title <title>", "native session title")
  .addHelpText(
    "after",
    "\nCreates the session, submits the prompt with native steer, prints the session ID and admission receipt, and returns immediately. The model resolves from --model, OPENCODE_MCP_MODEL, OC2_MODEL, then opencode-go/deepseek-v4.1-flash.\nExamples:\n  $ opencode-mcp start -C . -f prompt.txt\n  $ printf 'Review the tests' | opencode-mcp start -C . -f - --model opencode-go/deepseek-v4.1-flash#high --title Review",
  )
  .action((options) => runCommand(() => runStart(options)));

program
  .command("send")
  .description("submit a prompt to an existing native session immediately")
  .argument("<sessionID>", "native session ID")
  .requiredOption("-f, --file <file|->", "prompt file, or - for stdin")
  .option("--delivery <mode>", "steer (default) or queue", "steer")
  .addHelpText(
    "after",
    "\nSubmits directly to the owning service and session, prints the admission receipt, and does not wait for a turn.\nExamples:\n  $ opencode-mcp send ses_example -f steer.txt\n  $ printf 'Also run the focused tests' | opencode-mcp send ses_example -f - --delivery queue",
  )
  .action((sessionID, options) =>
    runCommand(() =>
      runSend({ sessionID, file: options.file, delivery: options.delivery }),
    ),
  );

program
  .command("status")
  .description("print current native session metadata as JSON")
  .argument("<sessionID>", "native session ID")
  .addHelpText("after", "\nExample:\n  $ opencode-mcp status ses_example")
  .action((sessionID) => runCommand(() => runStatus(sessionID)));

program
  .command("messages")
  .description("print the latest native messages with a cursor")
  .argument("<sessionID>", "native session ID")
  .option("--limit <n>", "messages to return (1-200, default 20)", limitValue)
  .option("--cursor <value>", "native cursor from a previous page")
  .addHelpText(
    "after",
    "\nExample:\n  $ opencode-mcp messages ses_example --limit 50",
  )
  .action((sessionID, options) =>
    runCommand(() =>
      runMessages({ sessionID, limit: options.limit, cursor: options.cursor }),
    ),
  );

program
  .command("sessions")
  .description("list native session IDs")
  .option("--limit <n>", "sessions to return (1-200, default 20)", limitValue)
  .addHelpText("after", "\nExample:\n  $ opencode-mcp sessions --limit 10")
  .action((options) => runCommand(() => runSessions({ limit: options.limit })));

program
  .command("monitor")
  .alias("watch")
  .description("stream normalized JSON events for a native session")
  .argument("<sessionID>", "native session ID")
  .option("--until-turn", "stop after the next observed turn completes")
  .option("--timeout <seconds>", "stop after N seconds", secondsValue)
  .addHelpText(
    "after",
    "\nEmits newline-delimited JSON: initial status, filtered native events, and normalized turn-start, steer-delivered, tool-completed, idle, success, failure, and timeout events. Live SSE has no replay, so each short read is reconciled through session.get. Without --until-turn, successful turns are followed; Ctrl+C stops observation without interrupting the session. Exit codes: 0 success, 2 failure/interrupted, 124 timeout, 130 stopped by signal.\nExamples:\n  $ opencode-mcp monitor ses_example --until-turn --timeout 300\n  $ opencode-mcp watch ses_example",
  )
  .action((sessionID, options) =>
    runCommand(() =>
      runMonitorCommand({
        sessionID,
        untilTurn: options.untilTurn,
        timeoutSeconds: options.timeout,
      }),
    ),
  );

program
  .command("run")
  .description("start a session and monitor until its first turn completes")
  .requiredOption("-C, --directory <path>", "working directory for the session")
  .requiredOption("-f, --file <file|->", "prompt file, or - for stdin")
  .option("--model <provider/id[#variant]>", "native model override")
  .option("--title <title>", "native session title")
  .option("--timeout <seconds>", "stop after N seconds", secondsValue)
  .addHelpText(
    "after",
    "\nEmits a started line with the session ID and admission receipt, then monitor JSON until the turn succeeds, fails, or times out (124).\nExample:\n  $ opencode-mcp run -C . -f prompt.txt --timeout 600",
  )
  .action((options) => runCommand(() => runRun(options)));

const args = process.argv.slice(2);
await program.parseAsync(args.length ? args : ["mcp"], { from: "user" });
