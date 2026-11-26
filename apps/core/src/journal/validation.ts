import { JournalError } from "./errors";
import {
  MAX_CURSOR_BYTES,
  MAX_DURATION_MS,
  MAX_ID_BYTES,
  MAX_MESSAGE_ID_BYTES,
  MAX_OPERATION_BYTES,
  MAX_PROMPT_BYTES,
  MAX_QUERY_LIMIT,
  MAX_SESSION_ID_BYTES,
  MAX_SESSION_TITLE_BYTES,
  DEFAULT_QUERY_LIMIT,
} from "./limits";
import {
  JOURNAL_OUTCOMES,
  type JournalFilter,
  type JournalOutcome,
  type JournalRecord,
} from "./types";

const UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function fail(message: string): never {
  throw new JournalError("validation", message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseUtc(value: unknown, name: string): string {
  if (typeof value !== "string" || !UTC_ISO.test(value))
    fail(`${name} must be a canonical UTC ISO-8601 timestamp`);
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value)
    fail(`${name} must be a valid UTC timestamp`);
  return value;
}

export function utcToMs(value: string): number {
  return Date.parse(value);
}

function boundedString(
  value: unknown,
  name: string,
  maxBytes: number,
  required: boolean,
): string | undefined {
  if (value === undefined || value === null) {
    if (required) fail(`${name} is required`);
    return undefined;
  }
  if (typeof value !== "string" || value.length === 0)
    fail(`${name} must be a non-empty string`);
  if (Buffer.byteLength(value, "utf8") > maxBytes)
    fail(`${name} exceeds ${maxBytes} bytes`);
  return value;
}

function outcome(value: unknown): JournalOutcome {
  if (
    typeof value !== "string" ||
    !(JOURNAL_OUTCOMES as readonly string[]).includes(value)
  )
    fail(`outcome must be one of ${JOURNAL_OUTCOMES.join(", ")}`);
  return value as JournalOutcome;
}

/** Keep only contract fields; unknown keys are never persisted. */
export function validateRecord(value: unknown): JournalRecord {
  if (!isObject(value)) fail("record must be an object");
  const duration = value.durationMs;
  if (
    typeof duration !== "number" ||
    !Number.isInteger(duration) ||
    duration < 0 ||
    duration > MAX_DURATION_MS
  )
    fail(`durationMs must be an integer from 0 to ${MAX_DURATION_MS}`);
  const record: JournalRecord = {
    id: boundedString(value.id, "id", MAX_ID_BYTES, true)!,
    at: parseUtc(value.at, "at"),
    operation: boundedString(
      value.operation,
      "operation",
      MAX_OPERATION_BYTES,
      true,
    )!,
    outcome: outcome(value.outcome),
    durationMs: duration,
  };
  const sessionId = boundedString(
    value.sessionId,
    "sessionId",
    MAX_SESSION_ID_BYTES,
    false,
  );
  const sessionTitle = boundedString(
    value.sessionTitle,
    "sessionTitle",
    MAX_SESSION_TITLE_BYTES,
    false,
  );
  const messageId = boundedString(
    value.messageId,
    "messageId",
    MAX_MESSAGE_ID_BYTES,
    false,
  );
  const prompt = boundedString(value.prompt, "prompt", MAX_PROMPT_BYTES, false);
  if (sessionId !== undefined) record.sessionId = sessionId;
  if (sessionTitle !== undefined) record.sessionTitle = sessionTitle;
  if (messageId !== undefined) record.messageId = messageId;
  if (prompt !== undefined) record.prompt = prompt;
  return record;
}

export function validateFilter(value: unknown): JournalFilter {
  if (value === undefined || value === null) return {};
  if (!isObject(value)) fail("filter must be an object");
  const filter: JournalFilter = {};
  const operation = boundedString(
    value.operation,
    "operation",
    MAX_OPERATION_BYTES,
    false,
  );
  const prefix = boundedString(
    value.operationPrefix,
    "operationPrefix",
    MAX_OPERATION_BYTES,
    false,
  );
  const sessionId = boundedString(
    value.sessionId,
    "sessionId",
    MAX_SESSION_ID_BYTES,
    false,
  );
  if (operation !== undefined) filter.operation = operation;
  if (prefix !== undefined) filter.operationPrefix = prefix;
  if (sessionId !== undefined) filter.sessionId = sessionId;
  if (value.outcome !== undefined) filter.outcome = outcome(value.outcome);
  if (value.from !== undefined) filter.from = parseUtc(value.from, "from");
  if (value.to !== undefined) filter.to = parseUtc(value.to, "to");
  if (
    filter.from !== undefined &&
    filter.to !== undefined &&
    utcToMs(filter.from) > utcToMs(filter.to)
  )
    fail("from must not be after to");
  return filter;
}

export function queryLimit(value: unknown): number {
  if (value === undefined || value === null) return DEFAULT_QUERY_LIMIT;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_QUERY_LIMIT
  )
    fail(`limit must be an integer from 1 to ${MAX_QUERY_LIMIT}`);
  return value;
}

export function validateQuery(value: unknown): {
  filter: JournalFilter;
  limit: number;
  cursor?: string;
} {
  if (value === undefined || value === null)
    return { filter: {}, limit: DEFAULT_QUERY_LIMIT };
  if (!isObject(value)) fail("query must be an object");
  const cursor = boundedString(value.cursor, "cursor", MAX_CURSOR_BYTES, false);
  const result: { filter: JournalFilter; limit: number; cursor?: string } = {
    filter: validateFilter(value.filter),
    limit: queryLimit(value.limit),
  };
  if (cursor !== undefined) result.cursor = cursor;
  return result;
}
