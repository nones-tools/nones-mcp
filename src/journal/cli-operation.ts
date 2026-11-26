import { randomUUID } from "node:crypto";
import { MAX_DURATION_MS } from "./limits";
import type { JournalAdapter, JournalOutcome, JournalRecord } from "./types";

/** Operations integrated into the 0.5.0 CLI. */
export const JOURNALED_OPERATIONS = [
  "opencode.session.start",
  "opencode.session.send",
  "opencode.session.run",
  "opencode.session.monitor",
  "opencode.session.status",
  "opencode.session.messages",
  "opencode.session.sessions",
  "opencode.service.start",
] as const;

export type JournaledOperation = (typeof JOURNALED_OPERATIONS)[number];

/** Only these operations may persist an authorized user prompt. */
const PROMPT_OPERATIONS = new Set<string>([
  "opencode.session.start",
  "opencode.session.send",
  "opencode.session.run",
]);

export const DEFAULT_RECORD_TIMEOUT_MS = 100;
export const MAX_RECORD_TIMEOUT_MS = 1_000;

export interface JournalMetadata {
  sessionId?: string;
  sessionTitle?: string;
  messageId?: string;
}

export interface JournaledOperationOptions<T> {
  operation: JournaledOperation | string;
  run: () => Promise<T>;
  /** Authorized user prompt, honored only for start/send/run. */
  prompt?: string;
  sessionId?: string;
  sessionTitle?: string;
  messageId?: string;
  /** Stable ID supplied by the caller when a retry must be idempotent. */
  id?: string;
  /** Extract native IDs/title from the successful result. */
  metadata?: (value: T) => JournalMetadata | undefined;
  /** Map a successful result to an outcome; defaults to success. */
  outcome?: (value: T) => JournalOutcome;
  /** Omit to open from config; null explicitly disables journaling. A passed
   *  adapter remains caller-owned, so omit it when a remote adapter must be
   *  bounded and closed by this helper. */
  adapter?: JournalAdapter | null;
  env?: Record<string, string | undefined>;
  cwd?: string;
  /** Short upper bound for the post-action record attempt. */
  recordTimeoutMs?: number;
  /** Injectable clock in epoch milliseconds. */
  now?: () => number;
}

export type JournalRecordOptions<T> = Omit<
  JournaledOperationOptions<T>,
  "run" | "now"
>;

type JournalRecordFields<T> = Omit<JournalRecordOptions<T>, "outcome">;

export function operationCapturesPrompt(operation: string): boolean {
  return PROMPT_OPERATIONS.has(operation);
}

function duration(started: number, ended: number): number {
  return Math.max(0, Math.min(MAX_DURATION_MS, Math.round(ended - started)));
}

function metadata<T>(
  options: JournalRecordFields<T>,
  value: T,
): JournalMetadata {
  if (!options.metadata) return {};
  try {
    return options.metadata(value) ?? {};
  } catch {
    return {};
  }
}

export function successOutcome<T>(
  options: JournalRecordOptions<T>,
  value: T,
): JournalOutcome {
  if (!options.outcome) return "success";
  try {
    return options.outcome(value);
  } catch {
    return "success";
  }
}

export function buildRecord<T>(
  options: JournalRecordFields<T>,
  started: number,
  ended: number,
  outcome: JournalOutcome,
  value?: T,
): JournalRecord {
  const extra = value === undefined ? {} : metadata(options, value);
  const record: JournalRecord = {
    id: options.id ?? randomUUID(),
    at: new Date(started).toISOString(),
    operation: options.operation,
    outcome,
    durationMs: duration(started, ended),
  };
  const sessionId = extra.sessionId ?? options.sessionId;
  const sessionTitle = extra.sessionTitle ?? options.sessionTitle;
  const messageId = extra.messageId ?? options.messageId;
  if (sessionId) record.sessionId = sessionId;
  if (sessionTitle) record.sessionTitle = sessionTitle;
  if (messageId) record.messageId = messageId;
  if (operationCapturesPrompt(options.operation) && options.prompt)
    record.prompt = options.prompt;
  return record;
}
