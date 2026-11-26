/**
 * Minimal strict validators for on-disk config. Messages name the JSON path
 * and the expectation, never the offending value, so credentials cannot leak
 * through diagnostics.
 */
export class ValidationError extends Error {
  constructor(readonly path: string, reason: string) {
    super(reason ? `${path} ${reason}` : path);
    this.name = "ValidationError";
  }
}

export function fail(path: string, reason: string): never {
  throw new ValidationError(path, reason);
}

export function asObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(path, "must be an object");
  }
  return value as Record<string, unknown>;
}

export function assertKeys(
  value: Record<string, unknown>,
  path: string,
  allowed: readonly string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(`${path}.${key}`, "is not a supported key");
  }
}

export function asString(value: unknown, path: string): string {
  if (typeof value !== "string") fail(path, "must be a string");
  return value;
}

export function asNonEmptyString(value: unknown, path: string): string {
  const text = asString(value, path);
  if (text.trim() === "") fail(path, "must not be empty");
  return text;
}

export function asBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, "must be a boolean");
  return value;
}

export function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, "must be an array");
  return value;
}

export function optional<T>(
  value: unknown,
  path: string,
  read: (value: unknown, path: string) => T,
): T | undefined {
  return value === undefined ? undefined : read(value, path);
}

export function asStringMap(
  value: unknown,
  path: string,
  keyPattern: RegExp,
  keyReason: string,
): Record<string, string> {
  const object = asObject(value, path);
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(object)) {
    if (!keyPattern.test(key)) fail(`${path}.${key}`, keyReason);
    result[key] = asString(entry, `${path}.${key}`);
  }
  return result;
}

export function asAbsolutePath(value: unknown, path: string): string {
  const text = asNonEmptyString(value, path);
  if (!text.startsWith("/")) fail(path, "must be an absolute path");
  if (text.split("/").includes("..")) fail(path, "must not contain '..'");
  return text;
}
