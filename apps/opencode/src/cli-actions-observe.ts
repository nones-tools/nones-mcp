import type { ActionDefinition } from "@nones/mcp-core";
import { asOptions, firstPositional, secondsValue } from "./cli-args";
import { runMonitorCommand } from "./monitor-cli";
import { runRun } from "./run-session";

export function observeActions(): ActionDefinition[] {
  return [
    {
      id: "session-monitor",
      cli: {
        command: "monitor",
        aliases: ["watch"],
        description: "stream normalized JSON events for a native session",
        arguments: [{ name: "sessionID", description: "native session ID" }],
        options: [
          {
            flags: "--until-turn",
            description: "stop after the next observed turn completes",
          },
          {
            flags: "--timeout <seconds>",
            description: "stop after N seconds",
            parse: secondsValue,
          },
        ],
        helpText:
          "\nEmits newline-delimited JSON: initial status, filtered native events, and normalized turn-start, steer-delivered, tool-completed, idle, success, failure, and timeout events. Live SSE has no replay, so each short read is reconciled through session.get. Without --until-turn, successful turns are followed; Ctrl+C stops observation without interrupting the session. Exit codes: 0 success, 2 failure/interrupted, 124 timeout, 130 stopped by signal.\nExamples:\n  $ opencode-mcp monitor ses_example --until-turn --timeout 300\n  $ opencode-mcp watch ses_example",
        journal: "opencode.session.monitor",
        parse: ({ positional, options }) => ({
          sessionID: firstPositional(positional),
          untilTurn: options.untilTurn,
          timeoutSeconds: options.timeout,
        }),
      },
      handle: (input) =>
        runMonitorCommand(
          asOptions<{
            sessionID: string;
            untilTurn?: boolean;
            timeoutSeconds?: number;
          }>(input),
        ),
    },
    {
      id: "session-run",
      cli: {
        command: "run",
        description: "start a session and monitor until its first turn completes",
        options: [
          {
            flags: "-C, --directory <path>",
            description: "working directory for the session",
            required: true,
          },
          {
            flags: "-f, --file <file|->",
            description: "prompt file, or - for stdin",
            required: true,
          },
          {
            flags: "--model <provider/id[#variant]>",
            description: "native model override",
          },
          { flags: "--title <title>", description: "native session title" },
          {
            flags: "--timeout <seconds>",
            description: "stop after N seconds",
            parse: secondsValue,
          },
        ],
        helpText:
          "\nEmits a started line with the session ID and admission receipt, then monitor JSON until the turn succeeds, fails, or times out (124).\nExample:\n  $ opencode-mcp run -C . -f prompt.txt --timeout 600",
        journal: "opencode.session.run",
        parse: ({ options }) => ({
          directory: options.directory,
          file: options.file,
          model: options.model,
          title: options.title,
          timeoutSeconds: options.timeout,
        }),
      },
      handle: (input) =>
        runRun(
          asOptions<{
            directory: string;
            file: string;
            model?: string;
            title?: string;
            timeoutSeconds?: number;
          }>(input),
        ),
    },
  ];
}
