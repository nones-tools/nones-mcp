import { randomUUID } from "node:crypto";
import { MAX_DURATION_MS } from "./limits";
import { operationCapturesPrompt } from "./operations";
import type { JournalSink } from "./sink";
import type { JournalOutcome, JournalRecord } from "./types";

const METADATA = Symbol.for("@nones/mcp-core.journal-metadata");

/** Caller-known metadata. No arguments, results or error bodies belong here. */
export interface JournalMetadata {
  prompt?: string;
  sessionId?: string;
  sessionTitle?: string;
  messageId?: string;
}

export interface InvocationOptions<T> {
  sink: JournalSink | null;
  operation: string;
  /** Caller-supplied stable ID for retries. */
  id?: string;
  metadata?: JournalMetadata;
  /** Extract metadata from a successful native value. */
  resultMetadata?: (value: T) => JournalMetadata | undefined;
  /** Classify a successful native value; defaults to success. */
  outcome?: (value: T) => JournalOutcome;
  /** Classify a thrown native error; defaults to cancellation-aware failure. */
  errorOutcome?: (error: unknown) => JournalOutcome;
  /** Cancellation signal associated with this invocation. */
  signal?: AbortSignal;
  /** Injectable clock in epoch milliseconds. */
  now?: () => number;
}

export function classifyToolResult(result: unknown): JournalOutcome {
  if (
    typeof result === "object" &&
    result !== null &&
    (result as { isError?: unknown }).isError === true
  )
    return "failure";
  return "success";
}

export function classifyError(
  error: unknown,
  signal?: AbortSignal,
): JournalOutcome {
  if (signal?.aborted) return "cancelled";
  const name =
    typeof error === "object" && error !== null
      ? (error as { name?: unknown }).name
      : undefined;
  return name === "AbortError" ? "cancelled" : "failure";
}

export function outcomeFromExitCode(code: number | undefined): JournalOutcome {
  if (code === undefined || code === 0) return "success";
  if (code === 130) return "cancelled";
  return "failure";
}

/** Attach metadata to a native error without changing its identity. */
export function attachJournalMetadata<T>(error: T, metadata: JournalMetadata): T {
  if (typeof error === "object" && error !== null) {
    (error as Record<symbol, JournalMetadata>)[METADATA] = metadata;
  }
  return error;
}

export function readJournalMetadata(error: unknown): JournalMetadata | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  return (error as Record<symbol, JournalMetadata | undefined>)[METADATA];
}

function now(clock: (() => number) | undefined): number {
  try {
    const value = (clock ?? Date.now)();
    return Number.isFinite(value) ? value : Date.now();
  } catch {
    return Date.now();
  }
}

function duration(started: number, ended: number): number {
  return Math.max(0, Math.min(MAX_DURATION_MS, Math.round(ended - started)));
}

function safeMetadata(
  read: (() => JournalMetadata | undefined) | undefined,
): JournalMetadata {
  if (!read) return {};
  try {
    return read() ?? {};
  } catch {
    return {};
  }
}

function merge(
  first: JournalMetadata | undefined,
  second: JournalMetadata | undefined,
): JournalMetadata {
  return { ...first, ...second };
}

function record(
  operation: string,
  started: number,
  ended: number,
  outcome: JournalOutcome,
  metadata: JournalMetadata,
  id: string | undefined,
): JournalRecord {
  const result: JournalRecord = {
    id: id ?? randomUUID(),
    at: new Date(started).toISOString(),
    operation,
    outcome,
    durationMs: duration(started, ended),
  };
  if (metadata.sessionId) result.sessionId = metadata.sessionId;
  if (metadata.sessionTitle) result.sessionTitle = metadata.sessionTitle;
  if (metadata.messageId) result.messageId = metadata.messageId;
  if (operationCapturesPrompt(operation) && metadata.prompt)
    result.prompt = metadata.prompt;
  return result;
}

async function write(sink: JournalSink | null, value: JournalRecord): Promise<void> {
  if (!sink) return;
  try {
    await sink.record(value);
  } catch {
    // Journaling is secondary and the sink is already best effort.
  }
}

/**
 * Runs one native invocation and writes exactly one metadata record after its
 * outcome is known. The native value or error is always preserved.
 */
export async function journalInvocation<T>(
  options: InvocationOptions<T>,
  run: () => Promise<T>,
): Promise<T> {
  const started = now(options.now);
  let value: T;
  try {
    value = await run();
  } catch (error) {
    const metadata = merge(options.metadata, readJournalMetadata(error));
    const outcome = options.errorOutcome
      ? safeOutcome(() => options.errorOutcome!(error), error, options.signal)
      : classifyError(error, options.signal);
    await write(
      options.sink,
      record(options.operation, started, now(options.now), outcome, metadata, options.id),
    );
    throw error;
  }
  const success: JournalOutcome = options.signal?.aborted
    ? "cancelled"
    : options.outcome
      ? safeOutcome(() => options.outcome!(value), value, options.signal)
      : "success";
  const metadata = merge(options.metadata, safeMetadata(
    options.resultMetadata ? () => options.resultMetadata!(value) : undefined,
  ));
  await write(
    options.sink,
    record(options.operation, started, now(options.now), success, metadata, options.id),
  );
  return value;
}

function safeOutcome(
  classify: () => JournalOutcome,
  value: unknown,
  signal?: AbortSignal,
): JournalOutcome {
  try {
    return classify();
  } catch {
    return value instanceof Error ? classifyError(value, signal) : "success";
  }
}
