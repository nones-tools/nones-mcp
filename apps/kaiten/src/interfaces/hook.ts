/** MCP tool response shape produced by the hook chain (matches the MCP SDK's content contract). */
export interface ToolResponse {
  isError?: true;
  content: { type: 'text'; text: string }[];
  // The MCP SDK's CallToolResult carries an open index signature; mirror it
  // so ToolResponse is directly returnable from a registered tool callback.
  [key: string]: unknown;
}

/** Mutable per-call context threaded through the hook chain. */
export interface ToolContext {
  toolName: string;
  /** Raw args as received from the MCP SDK (may be undefined). */
  args: unknown;
  /** Set by the terminal handler (success) or the error hook (failure). */
  response?: ToolResponse;
}

/**
 * Koa-style middleware over a tool invocation. A hook may act before/after
 * `next()` (logging), or catch errors thrown further down the chain and
 * turn them into an error response (error formatting).
 */
export type ToolHook = (ctx: ToolContext, next: () => Promise<void>) => Promise<void>;

/** The innermost element of the chain: actually runs the tool handler. */
export type ToolTerminal = (ctx: ToolContext) => Promise<void>;
