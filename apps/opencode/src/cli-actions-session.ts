import type { ActionDefinition } from "@nones/mcp-core";
import { asOptions, firstPositional, limitValue } from "./cli-args";
import { runMessages, runSessions, runStatus } from "./session-read";
import { runSend, runStart } from "./session-start";

export function sessionActions(): ActionDefinition[] {
  return [
    {
      id: "session-start",
      cli: {
        command: "start",
        description: "create a native session and submit a prompt with steer",
        helpText:
          "\nCreates the session, submits the prompt with native steer, prints the session ID and admission receipt, and returns immediately. The model resolves from --model, OPENCODE_MCP_MODEL, OC2_MODEL, then opencode-go/deepseek-v4.1-flash.\nExamples:\n  $ opencode-mcp start -C . -f prompt.txt\n  $ printf 'Review the tests' | opencode-mcp start -C . -f - --model opencode-go/deepseek-v4.1-flash#high --title Review",
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
        ],
        journal: "opencode.session.start",
        parse: ({ options }) => options,
      },
      handle: (input) =>
        runStart(
          asOptions<{
            directory: string;
            file: string;
            model?: string;
            title?: string;
          }>(input),
        ),
    },
    {
      id: "session-send",
      cli: {
        command: "send",
        description: "submit a prompt to an existing native session immediately",
        arguments: [{ name: "sessionID", description: "native session ID" }],
        options: [
          {
            flags: "-f, --file <file|->",
            description: "prompt file, or - for stdin",
            required: true,
          },
          {
            flags: "--delivery <mode>",
            description: "steer (default) or queue",
            default: "steer",
          },
        ],
        helpText:
          "\nSubmits directly to the owning service and session, prints the admission receipt, and does not wait for a turn.\nExamples:\n  $ opencode-mcp send ses_example -f steer.txt\n  $ printf 'Also run the focused tests' | opencode-mcp send ses_example -f - --delivery queue",
        journal: "opencode.session.send",
        parse: ({ positional, options }) => ({
          sessionID: firstPositional(positional),
          file: options.file,
          delivery: options.delivery,
        }),
      },
      handle: (input) =>
        runSend(
          asOptions<{ sessionID: string; file: string; delivery?: string }>(input),
        ),
    },
    {
      id: "session-status",
      cli: {
        command: "status",
        description: "print current native session metadata as JSON",
        arguments: [{ name: "sessionID", description: "native session ID" }],
        helpText: "\nExample:\n  $ opencode-mcp status ses_example",
        journal: "opencode.session.status",
        parse: ({ positional }) => ({ sessionID: firstPositional(positional) }),
      },
      handle: (input) => runStatus(asOptions<{ sessionID: string }>(input).sessionID),
    },
    {
      id: "session-messages",
      cli: {
        command: "messages",
        description: "print the latest native messages with a cursor",
        arguments: [{ name: "sessionID", description: "native session ID" }],
        options: [
          {
            flags: "--limit <n>",
            description: "messages to return (1-200, default 20)",
            parse: limitValue,
          },
          {
            flags: "--cursor <value>",
            description: "native cursor from a previous page",
          },
        ],
        helpText: "\nExample:\n  $ opencode-mcp messages ses_example --limit 50",
        journal: "opencode.session.messages",
        parse: ({ positional, options }) => ({
          sessionID: firstPositional(positional),
          limit: options.limit,
          cursor: options.cursor,
        }),
      },
      handle: (input) =>
        runMessages(
          asOptions<{ sessionID: string; limit?: number; cursor?: string }>(input),
        ),
    },
    {
      id: "session-sessions",
      cli: {
        command: "sessions",
        description: "list native session IDs",
        options: [
          {
            flags: "--limit <n>",
            description: "sessions to return (1-200, default 20)",
            parse: limitValue,
          },
        ],
        helpText: "\nExample:\n  $ opencode-mcp sessions --limit 10",
        journal: "opencode.session.sessions",
        parse: ({ options }) => ({ limit: options.limit }),
      },
      handle: (input) => runSessions(asOptions<{ limit?: number }>(input)),
    },
  ];
}
