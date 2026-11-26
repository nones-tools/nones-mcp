import type {
  ModuleContext,
  ModuleRuntime,
  ModuleTool,
  ToolCallResult,
  ToolDefinition,
  ToolModule,
} from "@nones/mcp-core";
import { InMemoryForwarder } from "@nones/mcp-core";
import { OpenCodeClient } from "./client";
import { createServer } from "./server";
import { version } from "./version";

/**
 * Source-owned, side-effect-free module export.
 *
 * Importing this file performs no I/O. `start()` connects to the existing
 * OpenCode service with the scoped module env, builds the native tool server
 * and bridges it in-process, so discovery, permissions, events and steer keep
 * their original implementations. `process.env` is never mutated.
 */

const MODULE_ID = "opencode";
const HOST_PACKAGE = "@nones/opencode-mcp";
const FLAGS = {
  destructive: "OPENCODE_MCP_ALLOW_DESTRUCTIVE",
  admin: "OPENCODE_MCP_ALLOW_ADMIN",
  exec: "OPENCODE_MCP_ALLOW_EXEC",
} as const;

export const module: ToolModule = {
  apiVersion: 1,
  id: MODULE_ID,
  version,
  host: { name: HOST_PACKAGE, version },

  async start(context: ModuleContext): Promise<ModuleRuntime> {
    if (Object.keys(context.config.options).length > 0) {
      throw new Error("opencode module does not accept options");
    }

    const env: Record<string, string | undefined> = {
      ...(process.env.HOME ? { HOME: process.env.HOME } : {}),
      ...context.env,
    };
    for (const [permission, flag] of Object.entries(FLAGS)) {
      if (context.config.permissions[permission as keyof typeof FLAGS]) env[flag] = "1";
      else delete env[flag];
    }

    const client = await OpenCodeClient.connect(env);
    const server = await createServer(client);
    const forwarder = await InMemoryForwarder.create({
      server,
      clientName: "nones-opencode-module",
      clientVersion: version,
    });

    const tools: ModuleTool[] = (await forwarder.listTools()).map((definition) => ({
      definition: definition as ToolDefinition,
      call: async (args, options): Promise<ToolCallResult> => {
        if (options.signal.aborted) {
          throw new Error(`tool ${definition.name} was cancelled before execution`);
        }
        return forwarder.callTool(definition.name, args, options.signal);
      },
    }));

    return {
      tools,
      async close() {
        await forwarder.close();
      },
    };
  },
};

export default module;
