import type { ActionDefinition } from "@nones/mcp-core";
import { failureCode, runDoctor, runMcp, runServerStart } from "./commands";
import { asOptions, secondsValue } from "./cli-args";
import { DEFAULT_SERVICE_TIMEOUT_SECONDS } from "./service-start";

export function coreActions(cliPath: string): ActionDefinition[] {
  return [
    {
      id: "mcp",
      cli: {
        command: "mcp",
        description: "run the stdio MCP server (default when no command is given)",
        helpText:
          "\nstdout carries JSON-RPC messages only; send diagnostics to stderr.\nExample:\n  $ opencode-mcp mcp",
        journal: false,
      },
      handle: () => runMcp(),
    },
    {
      id: "doctor",
      cli: {
        command: "doctor",
        description: "check the OpenCode connection and print a health report",
        helpText:
          "\nPrints indented JSON with healthy, info, and operations; credentials are never included.\nExample:\n  $ opencode-mcp doctor",
        journal: false,
      },
      handle: () => runDoctor(),
    },
    {
      id: "server-start",
      cli: {
        command: "server start",
        description: "reuse or start the managed service and prove MCP readiness",
        helpText:
          "\nReuses a ready managed service; otherwise launches the native `opencode2 service start`. Explicit OPENCODE_MCP_URL or OPENCODE_MCP_SERVICE_FILE is observed and never spawned. Never restarts, stops, or replaces a service. `mcp` and `doctor` still never auto-start.\nExit codes: 0 ready, 1 failure, 124 timeout, 130 canceled by signal.\nExamples:\n  $ opencode-mcp server start\n  $ oc2-mcp server start --timeout 60 --opencode-bin /usr/local/bin/opencode2",
        options: [
          {
            flags: "--timeout <seconds>",
            description: "overall startup timeout in seconds",
            parse: secondsValue,
            default: DEFAULT_SERVICE_TIMEOUT_SECONDS,
          },
          {
            flags: "--opencode-bin <path>",
            description: "opencode2 executable to use",
          },
        ],
        journal: "opencode.service.start",
        errorOutcome: (error) =>
          failureCode(error) === 130 ? "cancelled" : "failure",
        parse: ({ options }) => ({
          timeoutSeconds: options.timeout,
          opencodeBin: options.opencodeBin,
        }),
      },
      handle: (input) =>
        runServerStart({
          cliPath,
          ...asOptions<{ timeoutSeconds?: number; opencodeBin?: string }>(input),
        }),
    },
  ];
}
