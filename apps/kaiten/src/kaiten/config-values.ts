import fs from 'fs';
import os from 'os';
import path from 'path';
import { parseBool, parseIntList, parseNameList, parseNonNegativeInt, parsePositiveInt } from './config-parse';
import { KaitenConfigError } from './config-error';
import type { ConfigSource, KaitenConfig, KaitenConfigHealth } from './interfaces';

/**
 * Parses `KEY=VALUE` lines, ignoring blank lines and `#` comments. Values may
 * contain `=` themselves (only the first `=` splits key from value).
 */
export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}

function readEnvFile(filePath: string, required = false): Record<string, string> {
  try {
    return parseEnvFile(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (required) {
      const reason = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'does not exist' : 'cannot be read';
      throw new KaitenConfigError('INVALID_CONFIGURATION', `KAITEN_CONFIG_FILE ${reason}. Use an absolute path to a readable config file.`);
    }
    return {};
  }
}

function readProcessEnv(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('KAITEN_') && value !== undefined) result[key] = value;
  }
  return result;
}

/** Merges the four config sources, lowest to highest precedence. */
export interface MergedEnv {
  values: Record<string, string>;
  sources: Record<string, ConfigSource>;
}

function addLayer(target: MergedEnv, values: Record<string, string>, source: ConfigSource): void {
  for (const [key, value] of Object.entries(values)) {
    target.values[key] = value;
    target.sources[key] = source;
  }
}

/** Merges sources without ever retaining their file content outside this call. */
export function readMergedEnv(): MergedEnv {
  const merged: MergedEnv = { values: {}, sources: {} };
  addLayer(merged, readEnvFile(path.join(os.homedir(), '.kaiten', 'config')), '~/.kaiten/config');
  addLayer(merged, readEnvFile(path.join(process.cwd(), '.env')), '.env');
  addLayer(merged, readEnvFile(path.join(process.cwd(), '.kaiten.env')), '.kaiten.env');
  const explicitFile = process.env.KAITEN_CONFIG_FILE;
  if (explicitFile) addLayer(merged, readEnvFile(explicitFile, true), 'explicit config-file');
  addLayer(merged, readProcessEnv(), 'process env');
  return merged;
}

/** Builds a `KaitenConfig` from already-scoped values plus `overrides`; never throws. */
export function buildConfigFromEnv(
  values: Record<string, string>,
  overrides: Partial<KaitenConfig>
): KaitenConfig {
  return {
    apiUrl: values.KAITEN_API_URL ?? '',
    apiToken: values.KAITEN_API_TOKEN ?? '',
    defaultSpaceId: values.KAITEN_DEFAULT_SPACE_ID ? parseInt(values.KAITEN_DEFAULT_SPACE_ID, 10) : null,
    defaultBoardId: values.KAITEN_DEFAULT_BOARD_ID ? parseInt(values.KAITEN_DEFAULT_BOARD_ID, 10) : null,
    allowedSpaceIds: parseIntList(values.KAITEN_ALLOWED_SPACE_IDS, 'KAITEN_ALLOWED_SPACE_IDS'),
    allowedBoardIds: parseIntList(values.KAITEN_ALLOWED_BOARD_IDS, 'KAITEN_ALLOWED_BOARD_IDS'),
    logLevel: (values.KAITEN_LOG_LEVEL as KaitenConfig['logLevel']) || 'info',
    deleteAllow: (values.KAITEN_API_DELETE_ALLOW ?? '').toLowerCase() === 'true',
    allowedColumnIds: parseIntList(values.KAITEN_ALLOWED_COLUMN_IDS, 'KAITEN_ALLOWED_COLUMN_IDS'),
    allowedLaneIds: parseIntList(values.KAITEN_ALLOWED_LANE_IDS, 'KAITEN_ALLOWED_LANE_IDS'),
    protectedColumnIds: parseIntList(values.KAITEN_PROTECTED_COLUMN_IDS, 'KAITEN_PROTECTED_COLUMN_IDS'),
    enforceScope: parseBool(values.KAITEN_ENFORCE_SCOPE),
    readOnly: parseBool(values.KAITEN_READ_ONLY),
    disabledTools: parseNameList(values.KAITEN_DISABLED_TOOLS, 'KAITEN_DISABLED_TOOLS'),
    cardsLimit: parsePositiveInt(values.KAITEN_CARDS_LIMIT, 'KAITEN_CARDS_LIMIT'),
    minimalDefault: parseBool(values.KAITEN_MINIMAL_DEFAULT),
    defaultColumnId: parsePositiveInt(values.KAITEN_DEFAULT_COLUMN_ID, 'KAITEN_DEFAULT_COLUMN_ID'),
    defaultLaneId: parsePositiveInt(values.KAITEN_DEFAULT_LANE_ID, 'KAITEN_DEFAULT_LANE_ID'),
    httpTimeoutMs: parsePositiveInt(values.KAITEN_HTTP_TIMEOUT_MS, 'KAITEN_HTTP_TIMEOUT_MS'),
    httpRetries: parseNonNegativeInt(values.KAITEN_HTTP_RETRIES, 'KAITEN_HTTP_RETRIES'),
    ...overrides,
  };
}

export function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.username = '';
    url.password = '';
    return `${url.protocol}//${url.host}${url.pathname}`.replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function assertCredentials(config: KaitenConfig): void {
  if (config.apiUrl && config.apiToken) {
    if (normalizeOrigin(config.apiUrl)) return;
    throw new KaitenConfigError('INVALID_CONFIGURATION', 'KAITEN_API_URL must be an absolute http(s) URL without credentials.');
  }
  const missing = [!config.apiUrl ? 'KAITEN_API_URL' : null, !config.apiToken ? 'KAITEN_API_TOKEN' : null]
    .filter((v): v is string => v !== null)
    .join(', ');
  throw new KaitenConfigError(
    'MISSING_CONFIGURATION',
    `Missing required Kaiten configuration: ${missing}. ` +
      `Get an API token in Kaiten (Profile settings -> API tokens), then set the variables via ` +
      `npx -y @nones/kaiten-mcp init from a directory containing .env, environment, ` +
      `<cwd>/.kaiten.env, <cwd>/.env, or ~/.kaiten/config. ` +
      `AI agents: relay this to the user - the kaiten MCP server cannot work until ${missing} ${missing.includes(',') ? 'are' : 'is'} configured.`
  );
}

/** Safe configuration status for diagnostics and the read-only health tool. */
export function inspectValues(
  values: Record<string, string>,
  sources: Record<string, ConfigSource>,
  cwd: string
): KaitenConfigHealth {
  const apiUrl = values.KAITEN_API_URL ?? '';
  const apiToken = values.KAITEN_API_TOKEN ?? '';
  const origin = normalizeOrigin(apiUrl);
  const sourceOf = (key: string): ConfigSource => sources[key] ?? 'module config';
  const actions: string[] = [];
  if (!apiUrl) actions.push('Set KAITEN_API_URL through the module env or envFrom config.');
  else if (!origin) actions.push('Set KAITEN_API_URL to an absolute http(s) URL without credentials.');
  if (!apiToken) actions.push('Set KAITEN_API_TOKEN through the module envFrom config.');
  return {
    cwd,
    apiUrl: { present: !!apiUrl, source: apiUrl ? sourceOf('KAITEN_API_URL') : null, origin },
    apiToken: { present: !!apiToken, source: apiToken ? sourceOf('KAITEN_API_TOKEN') : null },
    ready: !!apiUrl && !!apiToken && !!origin,
    actions,
  };
}
