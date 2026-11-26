import { createRequire } from "node:module";
import {
  INVALID_PARAMS,
  INTERNAL_ERROR,
  ProtocolError,
  Server,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/server";
import type { ModuleHost } from "./modules";
import { isModuleError, type ToolDefinition } from "./types";

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

/**
 * Builds the single stdio-facing MCP server. Tool metadata is copied verbatim
 * so SDK v1 (Kaiten) and SDK v2 (OpenCode) children stay indistinguishable from
 * native modules at the wire level.
 */
export function createServer(host: ModuleHost): Server {
  const server = new Server(
    { name: SERVER_NAME, version: coreVersion() },
    {
      capabilities: { tools: { listChanged: false } },
      instructions:
        "Aggregated @nones MCP server. Each tool is provided by an explicitly installed, trusted module.",
    },
  );

  server.setRequestHandler("tools/list", () => ({
    tools: [...host.tools.values()].map((entry) => toWireTool(entry.definition)),
  }));

  server.setRequestHandler("tools/call", async (request, ctx) => {
    const hosted = host.tools.get(request.params.name);
    if (!hosted) {
      throw new ProtocolError(INVALID_PARAMS, `Tool ${request.params.name} not found`);
    }
    // `task` is accepted for wire compatibility but not proxied: neither child
    // server negotiates the tasks capability, so calls stay synchronous. The
    // parameter is deliberately not forwarded to the child.
    try {
      const result = await hosted.call(request.params.arguments ?? {}, {
        signal: ctx.mcpReq.signal,
      });
      return result as CallToolResult;
    } catch (error) {
      throw toError(error);
    }
  });

  return server;
}
