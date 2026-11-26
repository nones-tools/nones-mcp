import {
  buildRecord,
  withJournalSink,
  type JournalCompletionOptions,
  type JournalRecordOptions,
} from "./cli-operation";
import { JournalError } from "./errors";
import { openJournal } from "./runtime";
import type { JournalAdapter } from "./types";

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
    await withJournalSink(options, async (sink) => {
      await sink.record(record);
    });
  } catch {
    // Journaling must never change a native result or exit code.
  }
}

/** Reads are explicit admin operations; they fail clearly instead of swallowing. */
export async function requireJournal(
  options: Pick<JournalRecordOptions<never>, "adapter" | "env" | "cwd">,
): Promise<{ adapter: JournalAdapter; owned: boolean }> {
  if (options.adapter !== undefined) {
    if (options.adapter === null)
      throw new JournalError("config", "Journaling is disabled");
    return { adapter: options.adapter, owned: false };
  }
  const adapter = await openJournal({
    ...(options.env === undefined ? {} : { env: options.env }),
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
  });
  if (!adapter) throw new JournalError("config", "Journaling is disabled");
  return { adapter, owned: true };
}
