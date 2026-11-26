import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { JournalError } from "./errors";

export interface ConfigLocation {
  path: string;
  explicit: boolean;
}

export function configError(message: string): never {
  throw new JournalError("config", message);
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function home(env: Record<string, string | undefined>): string {
  return env.HOME || homedir();
}

export function xdgDirectory(
  env: Record<string, string | undefined>,
  name: string,
  fallback: string,
): string {
  const value = env[name];
  if (!value) return fallback;
  if (!path.isAbsolute(value))
    configError(`${name} must be an absolute directory`);
  return value;
}

export function configLocation(
  env: Record<string, string | undefined>,
  cwd: string,
): ConfigLocation {
  // Shared monorepo convention: a directory containing config.json.
  if (env.NONES_CONFIG_DIR) {
    const directory = path.resolve(cwd, env.NONES_CONFIG_DIR);
    if (!path.isAbsolute(env.NONES_CONFIG_DIR))
      configError("NONES_CONFIG_DIR must be an absolute directory");
    return { path: path.join(directory, "config.json"), explicit: false };
  }
  // Legacy standalone OpenCode override, kept readable during cutover.
  if (env.OPENCODE_MCP_CONFIG)
    return {
      path: path.resolve(cwd, env.OPENCODE_MCP_CONFIG),
      explicit: true,
    };
  const root = xdgDirectory(
    env,
    "XDG_CONFIG_HOME",
    path.join(home(env), ".config"),
  );
  // Package-neutral config convention shared by all nones packages.
  return {
    path: path.join(root, "nones", "config.json"),
    explicit: false,
  };
}

export function expandPath(
  value: string,
  base: string,
  env: Record<string, string | undefined>,
): string {
  if (value === "~") return home(env);
  if (value.startsWith("~/")) return path.join(home(env), value.slice(2));
  if (path.isAbsolute(value)) return path.normalize(value);
  return path.resolve(base, value);
}

const LEGACY_SQLITE_ADAPTER = "@nones/mcp-journal-sqlite";
const DEFAULT_SQLITE_ADAPTER = "@nones/journal/sqlite";

/**
 * Maps only the exact pre-5.0 default package specifier. Any other adapter is
 * resolved as written so a config never silently falls back to SQLite.
 */
export function adapterUrl(
  value: string,
  configDirectory: string,
  env: Record<string, string | undefined>,
): string {
  const specifier = value === LEGACY_SQLITE_ADAPTER ? DEFAULT_SQLITE_ADAPTER : value;
  if (specifier.startsWith("file:")) {
    let url: URL;
    try {
      url = new URL(specifier);
    } catch {
      configError("Custom journal adapter has an invalid file URL");
    }
    if (url.protocol !== "file:")
      configError("Custom journal adapter must use a file: URL");
    return url.href;
  }
  const explicitRelative =
    specifier.startsWith("./") || specifier.startsWith("../");
  const explicitHome = specifier === "~" || specifier.startsWith("~/");
  if (!path.isAbsolute(specifier) && !explicitRelative && !explicitHome) {
    // A module filename without a path prefix is a config mistake, not a
    // package: keep the original actionable error.
    if (/\.(?:mjs|cjs|js|ts)$/.test(specifier))
      configError(
        "Custom journal adapter must be an absolute path, a ./ or ../ path, " +
          "a ~/ path, a file: URL, or an installed package name",
      );
    // Already installed package: resolve it, never download at runtime.
    try {
      return import.meta.resolve(specifier);
    } catch {
      configError(
        `Custom journal adapter ${specifier} is not installed; ` +
          "install it explicitly or use an absolute file: path",
      );
    }
  }
  return pathToFileURL(expandPath(specifier, configDirectory, env)).href;
}

export async function readConfig(location: ConfigLocation): Promise<unknown> {
  try {
    return JSON.parse(await readFile(location.path, "utf8"));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" && !location.explicit) return {};
    if (code === "ENOENT")
      configError(`Config file not found: ${location.path}`);
    if (error instanceof SyntaxError)
      configError(`Config file is not valid JSON: ${location.path}`);
    configError(
      `Cannot read config file ${location.path}: ${(error as Error).message}`,
    );
  }
}
