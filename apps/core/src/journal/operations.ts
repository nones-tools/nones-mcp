/**
 * Stable operation identifiers shared by every journal producer.
 *
 * `@nones/mcp-core` owns this policy so an adapter never invents operation
 * names. Each identifier names the integration, the surface (`cli` or `mcp`)
 * and, for MCP calls, the frozen tool name. Tool arguments, results, prompts
 * and error bodies are never part of an identifier.
 */

/** Operations that existed in the 0.5.0 OpenCode CLI and keep their IDs. */
export const JOURNALED_OPERATIONS = [
  "opencode.session.start",
  "opencode.session.send",
  "opencode.session.run",
  "opencode.session.monitor",
  "opencode.session.status",
  "opencode.session.messages",
  "opencode.session.sessions",
  "opencode.service.start",
] as const;

export type JournaledOperation = (typeof JOURNALED_OPERATIONS)[number];

/** Only these operations may ever persist an authorized prompt. */
const PROMPT_OPERATIONS = new Set<string>([
  "opencode.session.start",
  "opencode.session.send",
  "opencode.session.run",
]);

export function operationCapturesPrompt(operation: string): boolean {
  return PROMPT_OPERATIONS.has(operation);
}

function segment(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, "_");
}

/** Stable MCP operation: `<integration>.mcp.<frozen tool name>`. */
export function mcpOperation(integration: string, toolName: string): string {
  return `${segment(integration)}.mcp.${segment(toolName)}`;
}

/** Stable CLI operation for commands that do not own a legacy ID. */
export function cliOperation(integration: string, command: string): string {
  return `${segment(integration)}.cli.${segment(command)}`;
}

/** Help, version, lifecycle and journal-admin reads are never journaled. */
export function isExcludedCommand(command: string | undefined): boolean {
  if (command === undefined) return true;
  return (
    command === "help" ||
    command === "--help" ||
    command === "-h" ||
    command === "--version" ||
    command === "-V" ||
    command === "mcp" ||
    command === "journal"
  );
}
