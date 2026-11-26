import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, type Transport } from "@modelcontextprotocol/server";
import { mapTool } from "./forward-map";
import type { ToolCallResult, ToolContent, ToolDefinition } from "./types";

/** Both the v2 `Server` and `McpServer` satisfy this bridge contract. */
export interface ConnectableServer {
  connect(transport: Transport): Promise<void>;
  close(): Promise<void>;
}

export interface InMemoryForwardOptions {
  /** Already-configured MCP server owned by the module. */
  server: ConnectableServer;
  clientName?: string;
  clientVersion?: string;
}

/**
 * In-process MCP seam: connects an existing v2 McpServer to a private client
 * over a linked transport, so modules can reuse native tool registration
 * without spawning a child. The module owns both ends and must call close().
 */
export class InMemoryForwarder {
  private constructor(
    private readonly client: Client,
    private readonly server: ConnectableServer,
  ) {}

  static async create(options: InMemoryForwardOptions): Promise<InMemoryForwarder> {
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client(
      {
        name: options.clientName ?? "nones-in-memory-bridge",
        version: options.clientVersion ?? "0.1.0",
      },
      { capabilities: {} },
    );
    await options.server.connect(serverTransport);
    await client.connect(clientTransport);
    return new InMemoryForwarder(client, options.server);
  }

  async listTools(): Promise<ToolDefinition[]> {
    const listed = await this.client.listTools();
    const tools = listed.tools.map(mapTool);
    const seen = new Set<string>();
    for (const tool of tools) {
      if (seen.has(tool.name)) throw new Error(`child server exposes duplicate tool ${tool.name}`);
      seen.add(tool.name);
    }
    return tools;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<ToolCallResult> {
    const result = await this.client.callTool({ name, arguments: args }, { signal });
    return {
      content: result.content as ToolContent[],
      ...(result.structuredContent !== undefined
        ? { structuredContent: result.structuredContent }
        : {}),
      ...(result.isError !== undefined ? { isError: result.isError } : {}),
      ...(result._meta !== undefined ? { _meta: result._meta } : {}),
    };
  }

  /** Idempotent; closes the private client and the module-owned server. */
  async close(): Promise<void> {
    try {
      await this.client.close();
    } catch {
      // Already closed.
    }
    try {
      await this.server.close();
    } catch {
      // Already closed.
    }
  }
}
