import type { JsonSchema, ToolCallResult, ToolDefinition } from "../types";
import type {
  ActionDefinition,
  CliExposure,
  CliHandlerResult,
  ToolExposure,
} from "./types";

const NAME = /^[A-Za-z0-9][A-Za-z0-9_. -]{0,127}$/;
const TOOL_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

function fail(message: string): never {
  throw new Error(`registry: ${message}`);
}

function isSchema(value: unknown): value is JsonSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkCli(exposure: CliExposure): void {
  if (typeof exposure.command !== "string" || !NAME.test(exposure.command))
    fail(`invalid CLI command ${String(exposure.command)}`);
  for (const alias of exposure.aliases ?? []) {
    if (typeof alias !== "string" || alias.length === 0)
      fail(`invalid CLI alias ${String(alias)} for ${exposure.command}`);
  }
  if (exposure.journal !== undefined && exposure.journal !== false) {
    if (typeof exposure.journal !== "string" || exposure.journal.length === 0)
      fail(`invalid journal operation for ${exposure.command}`);
  }
}

function checkTool<Input>(exposure: ToolExposure<Input>): void {
  if (typeof exposure.name !== "string" || !TOOL_NAME.test(exposure.name))
    fail(`invalid MCP tool name ${String(exposure.name)}`);
  if (!isSchema(exposure.inputSchema))
    fail(`tool ${exposure.name} needs a JSON Schema inputSchema`);
}

/**
 * Explicit, side-effect-free action registry shared by CLI and MCP surfaces.
 * Duplicate ids, commands, aliases and tool names fail closed.
 */
export class ActionRegistry {
  readonly integration: string;
  readonly #actions: ActionDefinition[] = [];
  readonly #commands = new Map<string, ActionDefinition>();
  readonly #tools = new Map<string, ActionDefinition>();

  constructor(integration: string, definitions: readonly ActionDefinition[] = []) {
    if (!NAME.test(integration)) fail(`invalid integration id ${integration}`);
    this.integration = integration;
    for (const definition of definitions) this.add(definition);
  }

  get actions(): readonly ActionDefinition[] {
    return this.#actions;
  }

  add<Input, Output>(definition: ActionDefinition<Input, Output>): void {
    if (!definition || typeof definition !== "object")
      fail("action must be an object");
    if (typeof definition.id !== "string" || definition.id.length === 0)
      fail("action id must be a non-empty string");
    if (typeof definition.handle !== "function")
      fail(`action ${definition.id} needs a handle function`);
    if (!definition.cli && !definition.tool)
      fail(`action ${definition.id} exposes neither a CLI command nor an MCP tool`);
    if (this.#actions.some((entry) => entry.id === definition.id))
      fail(`duplicate action id ${definition.id}`);

    // Preflight every collision before mutating any map or list.
    const commandKeys: string[] = [];
    if (definition.cli) {
      checkCli(definition.cli);
      commandKeys.push(definition.cli.command, ...(definition.cli.aliases ?? []));
      if (new Set(commandKeys).size !== commandKeys.length)
        fail(`action ${definition.id} repeats its own CLI command or alias`);
      for (const key of commandKeys) {
        if (this.#commands.has(key))
          fail(`duplicate CLI command or alias ${key}`);
      }
    }
    if (definition.tool) {
      checkTool(definition.tool);
      if (this.#tools.has(definition.tool.name))
        fail(`duplicate MCP tool ${definition.tool.name}`);
    }

    this.#actions.push(definition as ActionDefinition);
    for (const key of commandKeys)
      this.#commands.set(key, definition as ActionDefinition);
    if (definition.tool)
      this.#tools.set(definition.tool.name, definition as ActionDefinition);
  }

  command(name: string): ActionDefinition | undefined {
    return this.#commands.get(name);
  }

  tool(name: string): ActionDefinition | undefined {
    return this.#tools.get(name);
  }
}

export function createActionRegistry(
  integration: string,
  definitions: readonly ActionDefinition[] = [],
): ActionRegistry {
  return new ActionRegistry(integration, definitions);
}

function isResult(value: unknown): value is ToolCallResult {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as ToolCallResult).content)
  );
}

/** Converts a plain handler value into an MCP result without reshaping objects. */
export function toToolResult(value: unknown): ToolCallResult {
  if (isResult(value)) return value;
  return {
    content: [{ type: "text", text: JSON.stringify(value ?? null, null, 2) }],
  };
}

export interface ToolServerEntry {
  definition: ToolDefinition;
  integration: string;
  call(
    args: Record<string, unknown>,
    options: { signal: AbortSignal },
  ): Promise<ToolCallResult>;
}

/** Builds MCP entries from only the actions that explicitly expose a tool. */
export function registryTools(registry: ActionRegistry): ToolServerEntry[] {
  const entries: ToolServerEntry[] = [];
  for (const action of registry.actions) {
    const exposure = action.tool;
    if (!exposure) continue;
    const definition: ToolDefinition = {
      name: exposure.name,
      inputSchema: exposure.inputSchema,
    };
    if (exposure.title !== undefined) definition.title = exposure.title;
    if (exposure.description !== undefined)
      definition.description = exposure.description;
    if (exposure.outputSchema !== undefined)
      definition.outputSchema = exposure.outputSchema;
    if (exposure.annotations !== undefined)
      definition.annotations = exposure.annotations;
    if (exposure.execution !== undefined)
      definition.execution = exposure.execution;
    entries.push({
      definition,
      integration: registry.integration,
      call: async (args, options) => {
        let input: unknown = args;
        if (exposure.validate) {
          try {
            input = exposure.validate(args);
          } catch (error) {
            throw new ActionValidationError(
              error instanceof Error ? error.message : "invalid tool arguments",
            );
          }
        }
        const value = (await action.handle(input, {
          surface: "mcp",
          signal: options.signal,
        })) as CliHandlerResult;
        return toToolResult(value);
      },
    });
  }
  return entries;
}

/** Invalid MCP arguments map to JSON-RPC invalid params, never internal errors. */
export class ActionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionValidationError";
  }
}
