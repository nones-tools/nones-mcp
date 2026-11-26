import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import {
  ModuleError,
  ModuleErrorCode,
  type Logger,
  type ToolCallResult,
  type ToolContent,
  type ToolDefinition,
} from "./types";
import { CANCELLED, mapChildError, mapTool } from "./forward-map";

export interface StdioForwardOptions {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  /** Module id used only in diagnostics. */
  moduleId: string;
  clientName?: string;
  clientVersion?: string;
  logger?: Logger;
}


/**
 * Shared stdio child bridge: discovery, verbatim result forwarding,
 * JSON-RPC error preservation and cancellation. Adapters only describe how to
 * locate and configure their host server.
 */
export class StdioForwarder {
  private client: Client | undefined;
  private transport: StdioClientTransport | undefined;
  private connecting: Promise<Client> | undefined;
  private closing: Promise<void> | undefined;

  constructor(private readonly options: StdioForwardOptions) {}

  private async connect(): Promise<Client> {
    const transport = new StdioClientTransport({
      command: this.options.command,
      args: this.options.args,
      cwd: this.options.cwd,
      env: this.options.env,
      stderr: "inherit",
    });
    const client = new Client(
      {
        name: this.options.clientName ?? "nones-module-bridge",
        version: this.options.clientVersion ?? "0.1.0",
      },
      { capabilities: {} },
    );
    this.transport = transport;
    this.client = client;
    try {
      await client.connect(transport);
    } catch (error) {
      await this.close();
      throw new ModuleError(
        ModuleErrorCode.ModuleStartFailed,
        `could not start ${this.options.moduleId} child: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
    this.options.logger?.debug("child connected", {
      module: this.options.moduleId,
      command: this.options.command,
    });
    return client;
  }

  private async ensure(): Promise<Client> {
    // A concurrent shutdown closes the child; later calls wait for that
    // teardown so they cannot observe a client that is already dead.
    if (this.closing) await this.closing;
    if (this.client) return this.client;
    this.connecting ??= this.connect().finally(() => {
      this.connecting = undefined;
    });
    return this.connecting;
  }

  async listTools(): Promise<ToolDefinition[]> {
    let listed: Awaited<ReturnType<Client["listTools"]>>;
    try {
      listed = await (await this.ensure()).listTools();
    } catch (error) {
      throw mapChildError(error);
    }
    const tools = listed.tools.map(mapTool);
    const seen = new Set<string>();
    for (const tool of tools) {
      if (seen.has(tool.name)) {
        throw new ModuleError(
          ModuleErrorCode.ModuleIncompatible,
          `child server exposes duplicate tool ${tool.name}`,
        );
      }
      seen.add(tool.name);
    }
    return tools;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<ToolCallResult> {
    const client = await this.ensure();
    try {
      const result = await client.callTool({ name, arguments: args }, { signal });
      return {
        content: result.content as ToolContent[],
        ...(result.structuredContent !== undefined
          ? { structuredContent: result.structuredContent }
          : {}),
        ...(result.isError !== undefined ? { isError: result.isError } : {}),
        ...(result._meta !== undefined ? { _meta: result._meta } : {}),
      };
    } catch (error) {
      if (signal.aborted) {
        // The SDK already sent notifications/cancelled to the child. Keep the
        // shared child transport alive: closing it here would race a follow-up
        // call from the same client. Shutdown closes it via close().
        throw new ModuleError(
          ModuleErrorCode.ChildExited,
          `tool ${name} was cancelled`,
          CANCELLED,
        );
      }
      throw mapChildError(error);
    }
  }

  /** Idempotent; closes the owned child transport and process. */
  async close(): Promise<void> {
    this.closing ??= this.dispose();
    await this.closing;
    this.closing = undefined;
  }

  private async dispose(): Promise<void> {
    const client = this.client;
    const transport = this.transport;
    this.client = undefined;
    this.transport = undefined;
    try {
      await client?.close();
    } catch {
      // Closing an already-dead child is not actionable.
    }
    try {
      await transport?.close();
    } catch {
      // Same.
    }
  }
}
