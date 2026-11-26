import path from "node:path";
import {
  adapterUrl,
  configError,
  configLocation,
  expandPath,
  home,
  isObject,
  readConfig,
  xdgDirectory,
} from "./config-file";
import type { JournalAdapterSelection } from "./types";

export interface JournalSettings {
  enabled: boolean;
  capturePrompts: boolean;
  /** Directory containing the config file; relative adapter paths use it. */
  configDirectory: string;
  configPath: string | null;
  /** Set only for the built-in SQLite adapter. */
  sqlitePath: string | null;
  adapter: JournalAdapterSelection | null;
}

function boolean(value: unknown, name: string, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean")
    configError(`journal.${name} must be a boolean`);
  return value;
}

function parseAdapter(
  value: unknown,
  configDirectory: string,
  env: Record<string, string | undefined>,
): JournalAdapterSelection | null {
  if (value === undefined) return null;
  if (!isObject(value)) configError("journal.adapter must be an object");
  for (const key of Object.keys(value)) {
    if (key !== "module" && key !== "options")
      configError(`journal.adapter.${key} is not supported`);
  }
  if (typeof value.module !== "string" || value.module.length === 0)
    configError("journal.adapter.module must be a non-empty string");
  const selection: JournalAdapterSelection = {
    module: value.module,
    moduleUrl: adapterUrl(value.module, configDirectory, env),
  };
  if (value.options !== undefined) selection.options = value.options;
  return selection;
}

function parseJournal(
  raw: unknown,
  configDirectory: string,
  env: Record<string, string | undefined>,
): JournalSettings {
  const journal = isObject(raw) && raw.journal !== undefined ? raw.journal : {};
  if (!isObject(journal)) configError("journal must be an object");
  for (const key of Object.keys(journal)) {
    if (!["enabled", "capturePrompts", "sqlitePath", "adapter"].includes(key))
      configError(`journal.${key} is not supported`);
  }
  const enabled = boolean(journal.enabled, "enabled", true);
  const capturePrompts = boolean(
    journal.capturePrompts,
    "capturePrompts",
    true,
  );
  const adapter = parseAdapter(journal.adapter, configDirectory, env);
  if (
    adapter !== null &&
    journal.sqlitePath !== undefined &&
    journal.sqlitePath !== null
  )
    configError(
      "journal.sqlitePath and journal.adapter are mutually exclusive",
    );
  let sqlitePath: string | null = null;
  if (adapter === null) {
    const stateRoot = xdgDirectory(
      env,
      "XDG_STATE_HOME",
      path.join(home(env), ".local", "state"),
    );
    const configured = journal.sqlitePath;
    if (configured !== undefined && typeof configured !== "string")
      configError("journal.sqlitePath must be a string");
    if (configured === "") configError("journal.sqlitePath must not be empty");
    sqlitePath = configured
      ? expandPath(configured, configDirectory, env)
      : path.join(stateRoot, "nones", "journal.sqlite"); // package-neutral state
  }
  return {
    enabled,
    capturePrompts,
    configDirectory,
    configPath: null,
    sqlitePath,
    adapter,
  };
}

/**
 * Resolves user config without opening a database. Missing default config means
 * defaults; an explicitly selected config file that is missing or invalid fails.
 */
export async function resolveJournalConfig(
  env: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd(),
  configDirectory?: string,
): Promise<JournalSettings> {
  const location = configDirectory
    ? { path: path.join(configDirectory, "config.json"), explicit: false }
    : configLocation(env, cwd);
  const raw = await readConfig(location);
  if (!isObject(raw)) configError("Config file must contain a JSON object");
  const settings = parseJournal(raw, path.dirname(location.path), env);
  return {
    ...settings,
    configPath: location.explicit ? location.path : null,
  };
}
