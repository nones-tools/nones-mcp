import { z } from 'zod';
import type { KaitenConfig, KaitenConfigHealth } from '../kaiten';
import type { ToolContext, ToolDef } from '../interfaces';
import type { KaitenSDK } from '../sdk';
import { compose, createErrorHook, createLoggingHook } from './hooks';
import { ambientToolLogger, type ToolLogger } from './logger';
import { filterTools, healthTool, tools } from './tools';

export interface WireToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: ToolDef['annotations'];
  execution: { taskSupport: 'optional' };
}

export interface WireToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  [key: string]: unknown;
}

export interface ToolRuntimeOptions {
  version: string;
  /** Lenient config: discovery must work before credentials exist. */
  config: KaitenConfig;
  inspect: () => KaitenConfigHealth;
  /** Resolves lazily on first SDK-backed call. */
  getSdk: () => KaitenSDK;
  /** Module-scoped logger level; omitted for the standalone ambient logger. */
  logger?: ToolLogger;
}

export interface ToolRuntime {
  definitions: WireToolDefinition[];
  call(name: string, args: Record<string, unknown>): Promise<WireToolResult>;
}

/**
 * Shared tool registry, schema conversion and middleware chain. Used by the
 * standalone MCP server and by the source-owned module export so both expose
 * identical names, schemas, annotations and task support.
 */
export function createToolRuntime(options: ToolRuntimeOptions): ToolRuntime {
  const { kept, unknown } = filterTools(
    [...tools, healthTool(options.version, options.inspect)],
    options.config.disabledTools
  );
  if (unknown.length > 0) {
    console.error(`KAITEN_DISABLED_TOOLS names no known tool (ignored): ${unknown.join(', ')}`);
  }

  const logger = options.logger ?? ambientToolLogger;
  const schemas = new Map(kept.map((tool) => [tool.name, z.object(tool.inputSchema)]));
  const byName = new Map(kept.map((tool) => [tool.name, tool]));

  const definitions: WireToolDefinition[] = kept.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: z.toJSONSchema(schemas.get(tool.name)!, { target: 'draft-07' }),
    ...(tool.annotations ? { annotations: tool.annotations } : {}),
    execution: { taskSupport: 'optional' as const },
  }));

  async function call(name: string, args: Record<string, unknown>): Promise<WireToolResult> {
    const tool = byName.get(name);
    if (!tool) throw new Error(`Tool ${name} not found`);
    const parsed = schemas.get(name)!.parse(args ?? {});
    const runTool = compose([createLoggingHook(logger), createErrorHook(logger)], async (ctx) => {
      const result = await tool.handler(
        tool.requiresSdk === false ? (undefined as never) : options.getSdk(),
        ctx.args ?? {}
      );
      ctx.response = {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    });
    const ctx: ToolContext = { toolName: name, args: parsed };
    await runTool(ctx);
    return ctx.response as WireToolResult;
  }

  return { definitions, call };
}
