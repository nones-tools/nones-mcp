import type {
  ModuleContext,
  ModuleRuntime,
  ModuleTool,
  ToolCallResult,
  ToolDefinition,
  ToolModule,
} from '@nones/mcp-core';
import { inspectConfigFromEnv, loadConfigFromEnv } from '../kaiten';
import { KaitenSDK } from '../sdk';
import { readVersion } from './bootstrap';
import { createToolLogger } from './logger';
import { createToolRuntime } from './tool-runtime';

/**
 * Source-owned, side-effect-free module export for `@nones/mcp-core`.
 *
 * Importing this file performs no I/O: version, config, logger level and the
 * SDK are resolved inside `start()` / the first SDK-backed call. Configuration
 * is injected from the core's scoped module env - `process.env` is never
 * mutated to carry credentials.
 */

const MODULE_ID = 'kaiten';
const HOST_PACKAGE = '@nones/kaiten-mcp';

export const module: ToolModule = {
  apiVersion: 1,
  id: MODULE_ID,
  get version() {
    return readVersion();
  },
  host: {
    name: HOST_PACKAGE,
    get version() {
      return readVersion();
    },
  },

  async start(context: ModuleContext): Promise<ModuleRuntime> {
    const { permissions, options } = context.config;
    for (const key of ['admin', 'exec'] as const) {
      if (permissions[key]) {
        throw new Error(`kaiten module does not support permission ${key}`);
      }
    }
    if (Object.keys(options).length > 0) {
      throw new Error('kaiten module does not accept options');
    }

    // Lenient config feeds discovery and logging; credentials are checked only
    // when an SDK-backed tool is first called (lazy auth, as in standalone).
    const config = loadConfigFromEnv(
      context.env,
      { deleteAllow: permissions.destructive },
      false
    );
    let sdk: KaitenSDK | null = null;
    const runtime = createToolRuntime({
      version: readVersion(),
      config,
      inspect: () => inspectConfigFromEnv(context.env),
      logger: createToolLogger(config.logLevel),
      getSdk: () => {
        if (!sdk) {
          sdk = new KaitenSDK({
            config: loadConfigFromEnv(context.env, { deleteAllow: permissions.destructive }, true),
          });
        }
        return sdk;
      },
    });

    const tools: ModuleTool[] = runtime.definitions.map((definition) => ({
      definition: definition as ToolDefinition,
      call: async (args, callOptions): Promise<ToolCallResult> => {
        if (callOptions.signal.aborted) {
          throw new Error(`tool ${definition.name} was cancelled before execution`);
        }
        return runtime.call(definition.name, args);
      },
    }));

    return {
      tools,
      async close() {
        // No owned resources: the SDK reads through its own HTTP client.
      },
    };
  },
};

export default module;
