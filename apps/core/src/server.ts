import { createRequire } from "node:module";
import {
  INVALID_PARAMS,
  INTERNAL_ERROR,
  ProtocolError,
  Server,
  type CallToolResult,
  type ServerCapabilities,
  type Tool,
} from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import {
  JournalSink,
  classifyToolResult,
  journalInvocation,
  mcpOperation,
} from "./journal/index";
import type { ModuleHost } from "./modules";
import { ActionValidationError, type ToolServerEntry } from "./registry/registry";
import { isModuleError, type ToolCallResult, type ToolDefinition } from "./types";

export const SERVER_NAME = "nones-mcp";

function coreVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../package.json") as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function toWireTool(definition: ToolDefinition): Tool {
  const tool: Tool = {
    name: definition.name,
    inputSchema: definition.inputSchema as Tool["inputSchema"],
  };
  if (definition.title !== undefined) tool.title = definition.title;
  if (definition.description !== undefined) tool.description = definition.description;
  if (definition.outputSchema !== undefined) {
    tool.outputSchema = definition.outputSchema as NonNullable<Tool["outputSchema"]>;
  }
  if (definition.annotations !== undefined) tool.annotations = definition.annotations;
  if (definition.execution !== undefined) tool.execution = definition.execution;
  if (definition.icons !== undefined) tool.icons = definition.icons as Tool["icons"];
  if (definition._meta !== undefined) tool._meta = definition._meta;
  return tool;
}

function toError(error: unknown): ProtocolError {
  if (error instanceof ProtocolError) return error;
  if (error instanceof ActionValidationError) {
    return new ProtocolError(INVALID_PARAMS, error.message, { code: "VALIDATION" });
  }
  if (isModuleError(error)) {
    const data =
      error.data === undefined ? { code: error.code } : { code: error.code, data: error.data };
    return new ProtocolError(error.jsonRpcCode ?? INTERNAL_ERROR, error.message, data);
  }
  return new ProtocolError(
    INTERNAL_ERROR,
    error instanceof Error ? error.message : "Tool call failed",
  );
}

export interface ToolServerOptions {
  tools: readonly ToolServerEntry[];
  name?: string;
  version?: string;
  capabilities?: ServerCapabilities;
  instructions?: string;
  /** Trusted injected sink. Omit for a non-journaling protocol server. */
  journal?: JournalSink | null;
}

/**
 * Builds one stdio-facing MCP server from explicit tool entries. Metadata is
 * copied verbatim, calls are journaled exactly once when a sink is injected,
 * and cancellation is forwarded through the shared call options.
 */
export function createToolServer(options: ToolServerOptions): Server {
  const server = new Server(
    { name: options.name ?? SERVER_NAME, version: options.version ?? coreVersion() },
    {
      capabilities: options.capabilities ?? { tools: { listChanged: false } },
      ...(options.instructions === undefined ? {} : { instructions: options.instructions }),
    },
  );
  const byName = new Map(options.tools.map((entry) => [entry.definition.name, entry]));

  server.setRequestHandler("tools/list", () => ({
    tools: options.tools.map((entry) => toWireTool(entry.definition)),
  }));

  server.setRequestHandler("tools/call", async (request, ctx) => {
    const entry = byName.get(request.params.name);
    if (!entry) {
      throw new ProtocolError(INVALID_PARAMS, `Tool ${request.params.name} not found`);
    }
    const signal = ctx.mcpReq.signal;
    try {
      const result = await journalInvocation<ToolCallResult>(
        {
          sink: options.journal ?? null,
          operation: mcpOperation(entry.integration, entry.definition.name),
          signal,
          outcome: classifyToolResult,
        },
        () => entry.call(request.params.arguments ?? {}, { signal }),
      );
      return result as CallToolResult;
    } catch (error) {
      throw toError(error);
    }
  });

  return server;
}

/**
 * Connects one already-configured server to stdout/stdin. Diagnostics must stay
 * on stderr; callers own process lifecycle after this promise settles.
 */
export async function serveStdio(
  server: Server,
  options: { onClose?: () => void | Promise<void> } = {},
): Promise<void> {
  const transport = new StdioServerTransport();
  if (options.onClose) {
    transport.onclose = () => {
      void options.onClose?.();
    };
  }
  await server.connect(transport);
}

/**
 * Aggregate entry point retained for existing callers. Journaling is disabled
 * unless the caller explicitly injects a sink.
 */
export function createServer(
  host: ModuleHost,
  journal?: JournalSink | null,
): Server {
  const tools: ToolServerEntry[] = [...host.tools.entries()].map(([, hosted]) => ({
    definition: hosted.definition,
    integration: hosted.moduleId,
    call: async (args, options) => hosted.call(args, options),
  }));
  return createToolServer({ tools, journal: journal ?? null });
}
