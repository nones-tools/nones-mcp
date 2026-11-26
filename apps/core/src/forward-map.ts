import {
  ModuleError,
  ModuleErrorCode,
  type ToolDefinition,
} from "./types";

export const CANCELLED = -32800;

export function mapTool(raw: unknown): ToolDefinition {
  const tool = raw as {
    name: string;
    title?: string | undefined;
    description?: string | undefined;
    inputSchema?: unknown;
    outputSchema?: unknown;
    annotations?: Record<string, unknown> | undefined;
    execution?: Record<string, unknown> | undefined;
    icons?: unknown[] | undefined;
    _meta?: Record<string, unknown> | undefined;
  };
  const inputSchema = tool.inputSchema as Record<string, unknown> | undefined;
  if (typeof inputSchema !== "object" || inputSchema === null) {
    throw new ModuleError(
      ModuleErrorCode.ModuleIncompatible,
      `child tool ${tool.name} has no JSON Schema inputSchema`,
    );
  }
  const definition: ToolDefinition = {
    name: tool.name,
    inputSchema,
  };
  if (tool.title !== undefined) definition.title = tool.title;
  if (tool.description !== undefined) definition.description = tool.description;
  if (tool.outputSchema !== undefined) {
    definition.outputSchema = tool.outputSchema as Record<string, unknown>;
  }
  if (tool.annotations !== undefined) {
    definition.annotations = tool.annotations as NonNullable<ToolDefinition["annotations"]>;
  }
  if (tool.execution !== undefined) {
    definition.execution = tool.execution as NonNullable<ToolDefinition["execution"]>;
  }
  if (tool.icons !== undefined) definition.icons = tool.icons;
  if (tool._meta !== undefined) definition._meta = tool._meta;
  return definition;
}

export function mapChildError(error: unknown): ModuleError {
  const candidate = error as { message?: string; code?: number; data?: unknown };
  if (typeof candidate?.code === "number") {
    return new ModuleError(
      ModuleErrorCode.ChildError,
      candidate.message ?? "Child MCP request failed",
      candidate.code,
      candidate.data,
    );
  }
  return new ModuleError(
    ModuleErrorCode.ChildExited,
    error instanceof Error ? error.message : "Child MCP request failed",
  );
}
