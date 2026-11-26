import { buildConfigFromEnv, assertCredentials, inspectValues, readMergedEnv } from './config-values';
import type { KaitenConfig, KaitenConfigHealth } from './interfaces';

export { KaitenConfigError } from './config-error';
export { parseEnvFile } from './config-values';
export type { KaitenConfig } from './interfaces';

function buildConfig(overrides: Partial<KaitenConfig>): KaitenConfig {
  return buildConfigFromEnv(readMergedEnv().values, overrides);
}

/**
 * Loads Kaiten configuration, merging (lowest to highest precedence):
 * `~/.kaiten/config` -> `<cwd>/.env` -> `<cwd>/.kaiten.env` ->
 * `KAITEN_CONFIG_FILE` -> `process.env`.
 * `overrides` wins over all sources (used by tests / explicit callers).
 * No caching: cheap to call repeatedly, always reflects current env/files.
 *
 * Throws when `apiUrl`/`apiToken` are missing after merging. Use
 * `loadConfigLenient` when credentials aren't required yet.
 */
export function loadConfig(overrides: Partial<KaitenConfig> = {}): KaitenConfig {
  const config = buildConfig(overrides);
  assertCredentials(config);
  return config;
}

/** Same merge/parse as `loadConfig`, but never throws when credentials are missing. */
export function loadConfigLenient(overrides: Partial<KaitenConfig> = {}): KaitenConfig {
  return buildConfig(overrides);
}

/**
 * Module-scoped variant: reads only the `KAITEN_*` values supplied by the
 * caller (the host's resolved module env), never process.env or ambient files.
 * Credential enforcement is optional so `tools/list` works before setup.
 */
export function loadConfigFromEnv(
  env: Readonly<Record<string, string>>,
  overrides: Partial<KaitenConfig> = {},
  requireCredentials = true
): KaitenConfig {
  const config = buildConfigFromEnv({ ...env }, overrides);
  if (requireCredentials) assertCredentials(config);
  return config;
}

/** Safe configuration status for the env/file loader (standalone entrypoints). */
export function inspectConfig(): KaitenConfigHealth {
  const cwd = process.cwd();
  try {
    const merged = readMergedEnv();
    return inspectValues(merged.values, merged.sources, cwd);
  } catch (_error) {
    return {
      cwd,
      apiUrl: { present: false, source: null, origin: null },
      apiToken: { present: false, source: null },
      ready: false,
      actions: ['Fix KAITEN_CONFIG_FILE: use an absolute path to a readable config file.'],
      errorCode: 'INVALID_CONFIGURATION',
    };
  }
}

/** Safe configuration status for module-scoped env (no ambient files/env). */
export function inspectConfigFromEnv(env: Readonly<Record<string, string>>): KaitenConfigHealth {
  return inspectValues({ ...env }, {}, process.cwd());
}
