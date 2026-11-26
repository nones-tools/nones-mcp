import type { KaitenConfigHealth } from '../../kaiten';
import { inspectConfig } from '../../kaiten';
import type { ToolDef } from '../../interfaces';

/** Diagnostic-only tool: never constructs an SDK or makes a network request. */
export function healthTool(
  version: string,
  inspect: () => KaitenConfigHealth = inspectConfig
): ToolDef {
  return {
    name: 'kaiten_health',
    description: 'Show safe local MCP configuration diagnostics without contacting Kaiten or exposing secrets.',
    annotations: { readOnlyHint: true },
    requiresSdk: false,
    inputSchema: {},
    handler: async () => ({ serverVersion: version, ...inspect() }),
  };
}
