import { JournalError } from "./errors";
import { openJournal } from "./runtime";
import {
  buildRecord,
  DEFAULT_RECORD_TIMEOUT_MS,
  MAX_RECORD_TIMEOUT_MS,
  successOutcome,
  type JournalRecordOptions,
  type JournaledOperationOptions,
} from "./cli-operation";
import type { JournalAdapter, JournalOutcome, JournalRecord } from "./types";

type JournalWriteOptions = Pick<
  JournaledOperationOptions<never>,
  "adapter" | "env" | "cwd" | "recordTimeoutMs"
>;

export interface JournalCompletionOptions<T> extends Omit<
  JournalRecordOptions<T>,
  "outcome"
> {
  startedAt: number;
  endedAt: number;
  outcome: JournalOutcome;
  result?: T;
}

function timeoutFor(value: number | undefined): number {
  if (value === undefined) return DEFAULT_RECORD_TIMEOUT_MS;
  if (!Number.isInteger(value) || value < 1) return DEFAULT_RECORD_TIMEOUT_MS;
  return Math.min(value, MAX_RECORD_TIMEOUT_MS);
}

function now(clock: () => number): number {
  try {
    const value = clock();
    return Number.isFinite(value) ? value : Date.now();
  } catch {
    return Date.now();
  }
}

interface AdapterState {
  adapter?: JournalAdapter | null;
  owned: boolean;
  closed: boolean;
}

async function writeBestEffort(
  options: JournalWriteOptions,
  record: JournalRecord,
  state: AdapterState,
): Promise<void> {
  try {
    if (options.adapter === undefined) {
      state.adapter = await openJournal({ env: options.env, cwd: options.cwd });
      state.owned = true;
    } else {
      state.adapter = options.adapter;
    }
    if (!state.adapter) return;
    await state.adapter.record(record);
  } catch {
    // Journaling is secondary; never surface it as an action failure.
  } finally {
    if (state.owned && state.adapter && !state.closed) {
      state.closed = true;
      try {
        await state.adapter.close();
      } catch {
        // Ignore close failures from a best-effort record.
      }
    }
  }
}

async function boundedRecord(
  options: JournalWriteOptions,
  record: JournalRecord,
): Promise<void> {
  const state: AdapterState = { owned: false, closed: false };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(
      () => resolve("timeout"),
      timeoutFor(options.recordTimeoutMs),
    );
    (timer as { unref?: () => void }).unref?.();
  });
  const task = writeBestEffort(options, record, state);
  const result = await Promise.race([task, timeout]);
  if (timer) clearTimeout(timer);
  if (result === "timeout" && state.owned && state.adapter && !state.closed) {
    state.closed = true;
    try {
      void Promise.resolve(state.adapter.close()).catch(() => {});
    } catch {
      // Ignore close failures after a bounded wait.
    }
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
  const clock = options.now ?? Date.now;
  const started = now(clock);
  let value: T;
  try {
    value = await options.run();
  } catch (error) {
    const ended = now(clock);
    try {
      await boundedRecord(
        options,
        buildRecord(options, started, ended, "failure"),
      );
    } catch {
      // Never mask the native failure with a journaling failure.
    }
    throw error;
  }
  const ended = now(clock);
  try {
    await boundedRecord(
      options,
      buildRecord(
        options,
        started,
        ended,
        successOutcome(options, value),
        value,
      ),
    );
  } catch {
    // A successful native operation must remain successful.
  }
  return value;
}

/**
 * Records an operation that already completed. Useful when the CLI prints its
 * receipt before a best-effort metadata lookup. Never throws and stays bounded.
 */
export async function recordJournaledOperation<T>(
  options: JournalCompletionOptions<T>,
): Promise<void> {
  try {
    const record = buildRecord(
      options,
      options.startedAt,
      options.endedAt,
      options.outcome,
      options.result,
    );
    await boundedRecord(options, record);
  } catch {
    // Journaling must never change a native result or exit code.
  }
}

/** Reads are explicit admin operations; they fail clearly instead of swallowing. */
export async function requireJournal(
  options: Pick<JournaledOperationOptions<never>, "adapter" | "env" | "cwd">,
): Promise<{ adapter: JournalAdapter; owned: boolean }> {
  if (options.adapter !== undefined) {
    if (options.adapter === null)
      throw new JournalError("config", "Journaling is disabled");
    return { adapter: options.adapter, owned: false };
  }
  const adapter = await openJournal({ env: options.env, cwd: options.cwd });
  if (!adapter) throw new JournalError("config", "Journaling is disabled");
  return { adapter, owned: true };
}
