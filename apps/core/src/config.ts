import { homedir } from "node:os";
import path from "node:path";
import type { JournalSettings } from "./journal";
import type {
  LogLevel,
  ModuleConfig,
  SharedConfig,
} from "./types";
import { secretValues } from "./logger";
import {
  parseJournal,
  parseModuleConfig,
  parseShared,
  readJson,
} from "./config-schema";
import { asAbsolutePath, asObject, fail, ValidationError } from "./validate";

export const CONFIG_DIR_ENV = "NONES_CONFIG_DIR";

export interface LoadedModuleConfig {
  id: string;
  config: ModuleConfig;
  /** Literal env merged with resolved envFrom values (may hold credentials). */
  env: Record<string, string>;
}

export interface LoadedConfig {
  directory: string;
  shared: SharedConfig;
  journal: JournalSettings;
  modules: LoadedModuleConfig[];
  /** Values to scrub from diagnostics; never printed deliberately. */
  secrets: string[];
  warnings: string[];
}

export interface LoadConfigOptions {
  env?: NodeJS.ProcessEnv;
  home?: string;
  directory?: string;
}

export function resolveConfigDirectory(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string {
  const explicit = env.NONES_CONFIG_DIR;
  if (explicit !== undefined && explicit !== "") {
    return asAbsolutePath(explicit, CONFIG_DIR_ENV);
  }
  const xdg = env.XDG_CONFIG_HOME;
  if (xdg !== undefined && xdg !== "") {
    return path.join(asAbsolutePath(xdg, "XDG_CONFIG_HOME"), "nones");
  }
  return path.join(home, ".config", "nones");
}

function resolveModuleEnv(
  id: string,
  config: ModuleConfig,
  parent: NodeJS.ProcessEnv,
): Record<string, string> {
  const resolved: Record<string, string> = { ...config.env };
  for (const [child, source] of Object.entries(config.envFrom)) {
    const value = parent[source];
    if (value === undefined || value === "") {
      fail(`modules.${id}.envFrom.${child}`, `references ${source}, which is not set`);
    }
    resolved[child] = value;
  }
  return resolved;
}

export async function loadConfig(options: LoadConfigOptions = {}): Promise<LoadedConfig> {
  const env = options.env ?? process.env;
  const directory = options.directory ?? resolveConfigDirectory(env, options.home);
  const warnings: string[] = [];
  const sharedRaw = await readJson(path.join(directory, "config.json"));
  const shared = parseShared(sharedRaw ?? { modules: [] });
  const legacyRaw = asObject(sharedRaw ?? {}, "config").journal;
  const journalFileRaw = await readJson(path.join(directory, "journal.json"));
  if (journalFileRaw !== undefined && legacyRaw !== undefined) {
    warnings.push("journal.json overrides the legacy config.json journal object");
  }
  const journal = journalFileRaw !== undefined
    ? parseJournal(journalFileRaw, "journal.json")
    : parseJournal(legacyRaw, "config.json#journal");
  const modules: LoadedModuleConfig[] = [];
  const secrets: string[] = [];
  for (const id of shared.modules) {
    const file = path.join(directory, "modules", `${id}.json`);
    const raw = await readJson(file);
    if (raw === undefined) throw new ValidationError(file, "is missing for an enabled module");
    const config = parseModuleConfig(id, raw);
    if (!config.enabled) {
      warnings.push(`module ${id} is disabled by its module config`);
      continue;
    }
    const moduleEnv = resolveModuleEnv(id, config, env);
    secrets.push(...secretValues(moduleEnv));
    modules.push({ id, config, env: moduleEnv });
  }
  return { directory, shared, journal, modules, secrets, warnings };
}
