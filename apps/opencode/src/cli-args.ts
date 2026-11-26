import { InvalidArgumentError } from "commander";

export function limitValue(value: string): number {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200)
    throw new InvalidArgumentError("must be an integer from 1 to 200");
  return limit;
}

export function secondsValue(value: string): number {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0)
    throw new InvalidArgumentError("must be a positive number of seconds");
  return seconds;
}

export function asOptions<T>(value: unknown): T {
  return value as T;
}

export function firstPositional(value: unknown[]): string {
  return String(value[0] ?? "");
}
