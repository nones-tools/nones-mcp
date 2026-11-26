import { randomUUID } from "node:crypto";
import { journalInvocation, type JournalMetadata } from "./invocation";
import { MAX_DURATION_MS } from "./limits";
import { operationCapturesPrompt } from "./operations";
import { JournalSink } from "./sink";
import type { JournalAdapter, JournalOutcome, JournalRecord } from "./types";

export {
  DEFAULT_RECORD_TIMEOUT_MS,
  MAX_RECORD_TIMEOUT_MS,
} from "./limits";

export interface JournaledOperationOptions<T> {
  operation: string;
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

/** Minimal write-only seam shared by the completed-operation helpers. */
export interface JournalWriteOptions {
  adapter?: JournalAdapter | null;
  env?: Record<string, string | undefined>;
  cwd?: string;
  recordTimeoutMs?: number;
}

export interface JournalCompletionOptions<T> extends Omit<
  JournalRecordOptions<T>,
  "outcome"
> {
  startedAt: number;
  endedAt: number;
  outcome: JournalOutcome;
  result?: T;
}

type JournalRecordFields<T> = Omit<JournalRecordOptions<T>, "outcome">;

export { operationCapturesPrompt };

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

function sinkFor(options: JournalWriteOptions): JournalSink {
  if (options.adapter !== undefined) {
    return new JournalSink({
      adapter: options.adapter,
      ...(options.recordTimeoutMs === undefined
        ? {}
        : { recordTimeoutMs: options.recordTimeoutMs }),
    });
  }
  return new JournalSink({
    ...(options.env === undefined ? {} : { env: options.env }),
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    ...(options.recordTimeoutMs === undefined
      ? {}
      : { recordTimeoutMs: options.recordTimeoutMs }),
  });
}

/** Opens config-backed journaling, or an explicitly injected adapter. */
export async function withJournalSink<R>(
  options: JournalWriteOptions,
  run: (sink: JournalSink) => Promise<R>,
): Promise<R> {
  const sink = sinkFor(options);
  try {
    return await run(sink);
  } finally {
    if (options.adapter === undefined) await sink.close();
  }
}

/**
 * Runs a native CLI action and records it after completion. The result or thrown
 * error is always preserved; journal opening/recording failures are swallowed and
 * the record attempt is bounded so receipt output and exit are not delayed.
 */
export async function runJournaledOperation<T>(
  options: JournaledOperationOptions<T>,
): Promise<T> {
  const sink = sinkFor(options);
  try {
    return await journalInvocation(
      {
        sink,
        operation: options.operation,
        ...(options.id === undefined ? {} : { id: options.id }),
        metadata: {
          ...(options.prompt === undefined ? {} : { prompt: options.prompt }),
          ...(options.sessionId === undefined ? {} : { sessionId: options.sessionId }),
          ...(options.sessionTitle === undefined
            ? {}
            : { sessionTitle: options.sessionTitle }),
          ...(options.messageId === undefined ? {} : { messageId: options.messageId }),
        },
        ...(options.metadata === undefined ? {} : { resultMetadata: options.metadata }),
        ...(options.outcome === undefined ? {} : { outcome: options.outcome }),
        ...(options.now === undefined ? {} : { now: options.now }),
      },
      options.run,
    );
  } finally {
    if (options.adapter === undefined) await sink.close();
  }
}
