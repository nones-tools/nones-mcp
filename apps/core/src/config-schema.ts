import { readFile } from "node:fs/promises";
import type {
  JournalAdapterRef,
  JournalSettings,
} from "./journal";
import type {
  LogLevel,
  ModuleConfig,
  ModulePermissions,
  SharedConfig,
} from "./types";
import { envNameAllowedFor, isDeniedEnvName } from "./trust";
import {
  asAbsolutePath,
  asArray,
  asBoolean,
  asObject,
  asString,
  asStringMap,
  assertKeys,
  fail,
  optional,
} from "./validate";

const MAX_CONFIG_BYTES = 256 * 1024;
const ID = /^[a-z][a-z0-9-]{0,31}$/;
const ENV_KEY = /^[A-Z][A-Z0-9_]{0,63}$/;
const SECRET_LIKE = /(?:token|secret|password|passwd|credential|api[_-]?key|auth)/i;

export async function readJson(file: string): Promise<unknown> {
  let text: string;
  try {
    const buffer = await readFile(file);
    if (buffer.byteLength > MAX_CONFIG_BYTES) {
      fail(file, "is larger than the 256 KiB config limit");
    }
    text = buffer.toString("utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    fail(file, "does not contain valid JSON");
  }
}


export function parseShared(value: unknown): SharedConfig {
  const root = asObject(value, "config");
  assertKeys(root, "config", ["$schema", "version", "modules", "logLevel", "journal"]);
  if (root.version !== undefined && root.version !== 1) fail("config.version", "must be 1");
  const modules = asArray(root.modules ?? [], "config.modules").map((entry, index) => {
    const id = asString(entry, `config.modules[${index}]`);
    if (!ID.test(id)) fail(`config.modules[${index}]`, "is not a valid module id");
    return id;
  });
  if (new Set(modules).size !== modules.length) {
    fail("config.modules", "must not contain duplicates");
  }
  const logLevel = optional(root.logLevel, "config.logLevel", asString) ?? "info";
  if (!["debug", "info", "warn", "error"].includes(logLevel)) {
    fail("config.logLevel", "must be debug, info, warn or error");
  }
  return { version: 1, modules, logLevel: logLevel as LogLevel };
}

function parseAdapter(value: unknown, at: string): JournalAdapterRef | null {
  if (value === undefined || value === null) return null;
  const root = asObject(value, at);
  assertKeys(root, at, ["module", "options"]);
  const module = asString(root.module, `${at}.module`);
  if (!ID.test(module)) fail(`${at}.module`, "is not a valid module id");
  return {
    module,
    options: optional(root.options, `${at}.options`, asObject) ?? {},
  };
}

/** Accepts the standalone OpenCode 0.5.0 journal shape unchanged. */
export function parseJournal(
  value: unknown,
  source: JournalSettings["source"],
): JournalSettings {
  if (value === undefined) {
    return {
      enabled: false,
      capturePrompts: false,
      sqlitePath: null,
      adapter: null,
      source: "default",
    };
  }
  const at = "journal";
  const root = asObject(value, at);
  assertKeys(root, at, ["version", "enabled", "capturePrompts", "sqlitePath", "adapter"]);
  if (root.version !== undefined && root.version !== 1) fail(`${at}.version`, "must be 1");
  return {
    enabled: optional(root.enabled, `${at}.enabled`, asBoolean) ?? false,
    capturePrompts:
      optional(root.capturePrompts, `${at}.capturePrompts`, asBoolean) ?? false,
    sqlitePath: optional(root.sqlitePath, `${at}.sqlitePath`, asAbsolutePath) ?? null,
    adapter: parseAdapter(root.adapter, `${at}.adapter`),
    source,
  };
}

function parsePermissions(value: unknown): ModulePermissions {
  if (value === undefined) return { destructive: false, admin: false, exec: false };
  const root = asObject(value, "permissions");
  assertKeys(root, "permissions", ["destructive", "admin", "exec"]);
  return {
    destructive: optional(root.destructive, "permissions.destructive", asBoolean) ?? false,
    admin: optional(root.admin, "permissions.admin", asBoolean) ?? false,
    exec: optional(root.exec, "permissions.exec", asBoolean) ?? false,
  };
}

function checkEnvName(moduleId: string, name: string, at: string): void {
  if (isDeniedEnvName(name)) {
    fail(at, "is a reserved or executable-loader variable and cannot be set by a module");
  }
  if (!envNameAllowedFor(moduleId, name)) {
    fail(at, "must use the module's own variable prefix");
  }
}

export function parseModuleConfig(id: string, value: unknown): ModuleConfig {
  const at = `modules.${id}`;
  const root = asObject(value, at);
  assertKeys(root, at, ["version", "enabled", "permissions", "env", "envFrom", "options"]);
  if (root.version !== undefined && root.version !== 1) fail(`${at}.version`, "must be 1");
  const env = asStringMap(root.env ?? {}, `${at}.env`, ENV_KEY, "is not a valid variable name");
  for (const key of Object.keys(env)) {
    checkEnvName(id, key, `${at}.env.${key}`);
    if (SECRET_LIKE.test(key)) {
      fail(`${at}.env.${key}`, "is credential-like; use envFrom instead of a literal value");
    }
  }
  const envFrom = asStringMap(
    root.envFrom ?? {},
    `${at}.envFrom`,
    ENV_KEY,
    "is not a valid environment variable name",
  );
  for (const [child, source] of Object.entries(envFrom)) {
    if (env[child] !== undefined) fail(`${at}.envFrom.${child}`, "duplicates a literal env entry");
    checkEnvName(id, child, `${at}.envFrom.${child}`);
    checkEnvName(id, source, `${at}.envFrom.${child}`);
  }
  return {
    version: 1,
    enabled: optional(root.enabled, `${at}.enabled`, asBoolean) ?? true,
    permissions: parsePermissions(root.permissions),
    env,
    envFrom,
    options: optional(root.options, `${at}.options`, (entry, pointer) =>
      asObject(entry, pointer),
    ) ?? {},
  };
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
