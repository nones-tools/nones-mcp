import { loadConfig } from '../kaiten';
import type { KaitenConfig } from '../kaiten';

const LOG_LEVELS: Record<KaitenConfig['logLevel'], number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

export interface ToolLogger {
  debug(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

let ambientLevel: KaitenConfig['logLevel'] | null = null;

/**
 * Lazily resolves the standalone level on first use - importing this module
 * must not read process.env or the filesystem. Config load failure (missing
 * credentials) must not crash startup; fall back to 'info'.
 */
export function getLogLevel(): KaitenConfig['logLevel'] {
  if (!ambientLevel) {
    try {
      ambientLevel = loadConfig().logLevel || 'info';
    } catch {
      ambientLevel = 'info';
    }
  }
  return ambientLevel;
}

function emit(configured: KaitenConfig['logLevel'], level: keyof typeof LOG_LEVELS, message: string, data?: unknown): void {
  if (LOG_LEVELS[level] > LOG_LEVELS[configured]) return;
  const timestamp = new Date().toISOString();
  const msg = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  if (data !== undefined) {
    console.error(msg, typeof data === 'string' ? redact(data) : JSON.stringify(redact(data)));
  } else {
    console.error(msg);
  }
}

/** Module-scoped logger: the level is captured per runtime, never global. */
export function createToolLogger(level: KaitenConfig['logLevel']): ToolLogger {
  return {
    debug: (message, data) => emit(level, 'debug', message, data),
    error: (message, data) => emit(level, 'error', message, data),
  };
}

function redact(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(/Bearer\s+[^\s,]+/gi, 'Bearer [REDACTED]').replace(/([?&](?:token|access_token|api[_-]?key)=)[^&\s]+/gi, '$1[REDACTED]');
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, /token|authorization|secret|password/i.test(key) ? '[REDACTED]' : redact(item)]));
  }
  return value;
}

// Standalone diagnostics only. stdout stays the MCP protocol channel.
export function log(level: keyof typeof LOG_LEVELS, message: string, data?: unknown): void {
  emit(getLogLevel(), level, message, data);
}

export function errorLog(message: string, data?: unknown): void {
  log('error', message, data);
}

export function debugLog(message: string, data?: unknown): void {
  log('debug', message, data);
}

export const ambientToolLogger: ToolLogger = { debug: debugLog, error: errorLog };
