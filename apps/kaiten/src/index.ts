import {
  ModuleError,
  ModuleErrorCode,
  StdioForwarder,
  type ModuleContext,
  type ModuleRuntime,
  type ToolModule,
} from "@nones/mcp-core";
import {
  assertHostVersion,
  assertPermissions,
  childEnv,
  resolveHost,
} from "./host";

export const MODULE_ID = "kaiten";
export const MODULE_VERSION = "0.1.0";
export const HOST_PACKAGE = "@nones/kaiten-mcp";
export const HOST_VERSION = "4.3.0";
export const HOST_BIN = "kaiten";

/**
 * Wraps the published SDK v1 Kaiten server. Discovery and calls are forwarded
 * verbatim; the only additions are the permission-derived environment flags.
 */
export const module: ToolModule = {
  apiVersion: 1,
  id: MODULE_ID,
  version: MODULE_VERSION,
  host: { name: HOST_PACKAGE, version: HOST_VERSION },

  async start(context: ModuleContext): Promise<ModuleRuntime> {
    assertPermissions(MODULE_ID, context.config.permissions, ["destructive"]);
    if (Object.keys(context.config.options).length > 0) {
      throw new ModuleError(ModuleErrorCode.ConfigInvalid, "kaiten module does not accept options");
    }
    const host = await resolveHost(HOST_PACKAGE, [HOST_BIN]);
    assertHostVersion(host, HOST_VERSION);
    const forwarder = new StdioForwarder({
      moduleId: MODULE_ID,
      command: process.execPath,
      args: [host.bins[HOST_BIN] as string, "mcp"],
      cwd: context.stateDir,
      env: childEnv(context, {
        KAITEN_API_DELETE_ALLOW: context.config.permissions.destructive ? "true" : "false",
      }),
      clientName: `nones-${MODULE_ID}-module`,
      clientVersion: MODULE_VERSION,
      logger: context.logger,
    });
    try {
      const tools = await forwarder.listTools();
      if (tools.length === 0) {
        throw new ModuleError(ModuleErrorCode.ModuleStartFailed, "kaiten server exposed no tools");
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
