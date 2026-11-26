import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { LoadedConfig } from "./config";
import { scopedLogger } from "./logger";
import { TRUSTED_MODULES } from "./trust";
import {
  MODULE_API_VERSION,
  ModuleError,
  ModuleErrorCode,
  type Logger,
  type ModuleRuntime,
  type ModuleTool,
  type ToolDefinition,
  type ToolModule,
} from "./types";

/**
 * Explicit allowlist of adapters the core will load. There is deliberately no
 * config key for a module entry path, command or CWD, so a config file can
 * never introduce executable code. Packages are resolved from the core's own
 * dependency tree, never from process.cwd().
 */
export { TRUSTED_MODULES } from "./trust";

const TOOL_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

export interface HostedTool {
  moduleId: string;
  definition: ToolDefinition;
  call: ModuleTool["call"];
}

interface RunningModule {
  id: string;
  runtime: ModuleRuntime;
}

export function validateModuleDefinition(value: unknown, id: string): ToolModule {
  const candidate = value as Partial<ToolModule> | undefined;
  if (!candidate || typeof candidate !== "object" || typeof candidate.start !== "function") {
    throw new ModuleError(ModuleErrorCode.ModuleIncompatible, `module ${id} has no exported module definition`);
  }
  if (candidate.apiVersion !== MODULE_API_VERSION) {
    throw new ModuleError(
      ModuleErrorCode.ModuleIncompatible,
      `module ${id} targets API ${String(candidate.apiVersion)}; core requires ${MODULE_API_VERSION}`,
    );
  }
  if (candidate.id !== id) {
    throw new ModuleError(
      ModuleErrorCode.ModuleIncompatible,
      `module package for ${id} declares id ${String(candidate.id)}`,
    );
  }
  return candidate as ToolModule;
}

export function indexTool(
  tools: Map<string, HostedTool>,
  moduleId: string,
  value: unknown,
  index: number,
): void {
  const tool = value as Partial<ModuleTool> | undefined;
  const definition = tool?.definition as Partial<ToolDefinition> | undefined;
  if (!tool || typeof tool.call !== "function" || !definition) {
    throw new ModuleError(
      ModuleErrorCode.ModuleStartFailed,
      `module ${moduleId} returned an invalid tool at index ${index}`,
    );
  }
  const name = definition.name;
  if (typeof name !== "string" || !TOOL_NAME.test(name)) {
    throw new ModuleError(
      ModuleErrorCode.ModuleStartFailed,
      `module ${moduleId} returned an invalid tool name at index ${index}`,
    );
  }
  if (typeof definition.inputSchema !== "object" || definition.inputSchema === null) {
    throw new ModuleError(
      ModuleErrorCode.ModuleStartFailed,
      `tool ${name} from ${moduleId} has no JSON Schema inputSchema`,
    );
  }
  const existing = tools.get(name);
  if (existing) {
    throw new ModuleError(
      ModuleErrorCode.DuplicateTool,
      `tool ${name} is provided by both ${existing.moduleId} and ${moduleId}`,
    );
  }
  tools.set(name, { moduleId, definition: definition as ToolDefinition, call: tool.call });
}

export class ModuleHost {
  private constructor(
    readonly tools: ReadonlyMap<string, HostedTool>,
    private readonly runtimes: RunningModule[],
    private readonly abort: AbortController,
    private readonly logger: Logger,
  ) {}

  static async start(loaded: LoadedConfig, logger: Logger): Promise<ModuleHost> {
    const abort = new AbortController();
    const runtimes: RunningModule[] = [];
    const tools = new Map<string, HostedTool>();
    try {
      for (const entry of loaded.modules) {
        const trusted = TRUSTED_MODULES[entry.id];
        if (!trusted) {
          throw new ModuleError(
            ModuleErrorCode.ModuleUnavailable,
            `module ${entry.id} is not in the trusted module allowlist`,
          );
        }
        const specifier = trusted.package;
        let resolved: string;
        try {
          resolved = fileURLToPath(import.meta.resolve(specifier));
        } catch {
          throw new ModuleError(
            ModuleErrorCode.ModuleUnavailable,
            `module ${entry.id} requires installed package ${specifier}`,
          );
        }
        const namespace = (await import(pathToFileURL(resolved).href)) as {
          module?: unknown;
          default?: unknown;
        };
        const mod = validateModuleDefinition(namespace.module ?? namespace.default, entry.id);
        const stateDir = path.join(loaded.directory, "state", entry.id);
        await mkdir(stateDir, { recursive: true, mode: 0o700 });
        const moduleLogger = scopedLogger(logger, { module: entry.id });
        const runtime = await mod.start({
          id: entry.id,
          version: mod.version,
          config: entry.config,
          env: Object.freeze({ ...entry.env }),
          shared: { logLevel: loaded.shared.logLevel, moduleId: entry.id },
          journal: Object.freeze({ ...loaded.journal }),
          stateDir,
          logger: moduleLogger,
          signal: abort.signal,
        });
        if (!runtime || !Array.isArray(runtime.tools)) {
          throw new ModuleError(
            ModuleErrorCode.ModuleStartFailed,
            `module ${entry.id} returned no runtime tools`,
          );
        }
        const before = tools.size;
        runtime.tools.forEach((rawTool, index) => {
          indexTool(tools, entry.id, rawTool, index);
        });
        runtimes.push({ id: entry.id, runtime });
        moduleLogger.info("module started", {
          tools: tools.size - before,
          host: mod.host,
        });
      }
    } catch (error) {
      await ModuleHost.closeAll(runtimes, abort, logger);
      throw error;
    }
    return new ModuleHost(tools, runtimes, abort, logger);
  }

  async close(): Promise<void> {
    await ModuleHost.closeAll(this.runtimes, this.abort, this.logger);
  }

  private static async closeAll(
    runtimes: RunningModule[],
    abort: AbortController,
    logger: Logger,
  ): Promise<void> {
    abort.abort();
    for (const entry of [...runtimes].reverse()) {
      try {
        await entry.runtime.close();
      } catch (error) {
        logger.warn("module close failed", {
          module: entry.id,
          error: error instanceof Error ? error.message : "unknown error",
        });
      }
    }
    runtimes.length = 0;
  }
}
