import type { z } from 'zod';
import type { KaitenSDK } from '../sdk';

/**
 * MCP tool behavior hints, passed through verbatim to the SDK's
 * `registerTool` (`annotations` field) so clients can render/gate tools
 * appropriately (e.g. skip confirmation UI for read-only tools, warn before
 * destructive ones). See the MCP spec's ToolAnnotations.
 */
export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
}

/**
 * A single MCP tool registration: name, description, zod input shape, and
 * the handler that maps validated args onto SDK calls.
 */
export interface ToolDef {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
  handler: (sdk: KaitenSDK, args: any) => Promise<unknown>;
  annotations?: ToolAnnotations;
  /** Health/diagnostic tools may run before credentials or an SDK exist. */
  requiresSdk?: boolean;
}
