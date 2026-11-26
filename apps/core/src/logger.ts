import type { LogLevel, Logger } from "./types";

const SEVERITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SECRET_KEY = /(?:token|secret|password|passwd|credential|api[_-]?key|auth)/i;

/**
 * Creates a stderr-only logger. Secret values handed to the factory are
 * scrubbed from every line as a last line of defence; callers still must not
 * pass credentials as fields.
 */
export function createLogger(
  level: LogLevel,
  secrets: readonly string[] = [],
): Logger {
  const usable = secrets.filter((secret) => secret.length >= 8);
  const write = (
    entryLevel: LogLevel,
    message: string,
    fields?: Record<string, unknown>,
    scope?: Record<string, unknown>,
  ): void => {
    if (SEVERITY[entryLevel] < SEVERITY[level]) return;
    let line = JSON.stringify({
      time: new Date().toISOString(),
      level: entryLevel,
      message,
      ...scope,
      ...fields,
    });
    for (const secret of usable) {
      line = line.split(secret).join("[redacted]");
    }
    line = line.replace(/https?:\/\/[^\s/@"]+:[^\s/@"]+@/g, "[redacted-url]");
    process.stderr.write(`${line}\n`);
  };
  return {
    debug: (message, fields) => write("debug", message, fields),
    info: (message, fields) => write("info", message, fields),
    warn: (message, fields) => write("warn", message, fields),
    error: (message, fields) => write("error", message, fields),
  };
}

export function scopedLogger(
  logger: Logger,
  scope: Record<string, unknown>,
): Logger {
  const forward =
    (method: keyof Logger) =>
    (message: string, fields?: Record<string, unknown>): void => {
      logger[method](message, { ...scope, ...fields });
    };
  return {
    debug: forward("debug"),
    info: forward("info"),
    warn: forward("warn"),
    error: forward("error"),
  };
}

/** Collects secret-looking values so they can be scrubbed from logs. */
export function secretValues(env: Readonly<Record<string, string>>): string[] {
  return Object.entries(env)
    .filter(([key]) => SECRET_KEY.test(key))
    .map(([, value]) => value)
    .filter((value) => value.length >= 8);
}
