import { loadConfig } from '../kaiten';
import type { KaitenConfig } from '../kaiten';

const LOG_LEVELS: Record<KaitenConfig['logLevel'], number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// Config load failure (e.g. missing credentials) must not crash startup - the
// server still needs to answer `tools/list` without credentials configured.
// Fall back to 'info' in that case, matching the old server's behavior.
function resolveLogLevel(): KaitenConfig['logLevel'] {
  try {
    const config = loadConfig();
    if (config.logLevel) return config.logLevel;
  } catch {
    // Use default log level
  }
  return 'info';
}

export const logLevel: KaitenConfig['logLevel'] = resolveLogLevel();

function shouldLog(level: keyof typeof LOG_LEVELS): boolean {
  return LOG_LEVELS[level] <= LOG_LEVELS[logLevel];
}

// All diagnostic logging goes to stderr only - stdout is the MCP protocol
// channel over stdio and must never carry anything but JSON-RPC messages.
export function log(level: keyof typeof LOG_LEVELS, message: string, data?: unknown): void {
  if (!shouldLog(level)) return;
  const timestamp = new Date().toISOString();
  const msg = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  if (data !== undefined) {
    console.error(msg, typeof data === 'string' ? redact(data) : JSON.stringify(redact(data)));
  } else {
    console.error(msg);
  }
}

function redact(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(/Bearer\s+[^\s,]+/gi, 'Bearer [REDACTED]').replace(/([?&](?:token|access_token|api[_-]?key)=)[^&\s]+/gi, '$1[REDACTED]');
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, /token|authorization|secret|password/i.test(key) ? '[REDACTED]' : redact(item)]));
  }
  return value;
}

export function errorLog(message: string, data?: unknown): void {
  log('error', message, data);
}

export function debugLog(message: string, data?: unknown): void {
  log('debug', message, data);
}
