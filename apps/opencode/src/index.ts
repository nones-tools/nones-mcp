import {
  ModuleError,
  ModuleErrorCode,
  StdioForwarder,
  type ModuleContext,
  type ModuleRuntime,
  type ToolModule,
} from "@nones/mcp-core";
import { assertHostVersion, childEnv, resolveHost } from "./host";

export const MODULE_ID = "opencode";
export const MODULE_VERSION = "0.1.0";
export const HOST_PACKAGE = "@nones/opencode-mcp";
export const HOST_VERSION = "0.3.0";
export const HOST_BIN = "opencode-mcp";
/** 0.3.0 also ships this alias; both must point at the same executable. */
export const HOST_ALIAS_BIN = "oc2-mcp";

/** Resolves both 0.3.0 bins and requires the alias to point at the same file. */
export async function resolveOpencodeHost() {
  const host = await resolveHost(HOST_PACKAGE, [HOST_BIN, HOST_ALIAS_BIN]);
  assertHostVersion(host, HOST_VERSION);
  if (host.bins[HOST_BIN] !== host.bins[HOST_ALIAS_BIN]) {
    throw new ModuleError(
      ModuleErrorCode.ModuleIncompatible,
      `${HOST_PACKAGE} maps ${HOST_ALIAS_BIN} to a different executable`,
    );
  }
  return host;
}

/** Wraps the published SDK v2 OpenCode server; names and results pass through. */
export const module: ToolModule = {
  apiVersion: 1,
  id: MODULE_ID,
  version: MODULE_VERSION,
  host: { name: HOST_PACKAGE, version: HOST_VERSION },

  async start(context: ModuleContext): Promise<ModuleRuntime> {
    if (Object.keys(context.config.options).length > 0) {
      throw new ModuleError(ModuleErrorCode.ConfigInvalid, "opencode module does not accept options");
    }
    const host = await resolveOpencodeHost();
    const { permissions } = context.config;
    const forwarder = new StdioForwarder({
      moduleId: MODULE_ID,
      command: process.execPath,
      args: [host.bins[HOST_BIN] as string, "mcp"],
      cwd: context.stateDir,
      env: childEnv(context, {
        ...(permissions.destructive ? { OPENCODE_MCP_ALLOW_DESTRUCTIVE: "1" } : {}),
        ...(permissions.admin ? { OPENCODE_MCP_ALLOW_ADMIN: "1" } : {}),
        ...(permissions.exec ? { OPENCODE_MCP_ALLOW_EXEC: "1" } : {}),
      }),
      clientName: `nones-${MODULE_ID}-module`,
      clientVersion: MODULE_VERSION,
      logger: context.logger,
    });
    try {
      const tools = await forwarder.listTools();
      if (tools.length === 0) {
        throw new ModuleError(ModuleErrorCode.ModuleStartFailed, "opencode server exposed no tools");
      }
      return {
        tools: tools.map((definition) => ({
          definition,
          call: (args, options) => forwarder.callTool(definition.name, args, options.signal),
        })),
        close: () => forwarder.close(),
      };
    } catch (error) {
      await forwarder.close();
      throw error;
    }
  },
};

export default module;
