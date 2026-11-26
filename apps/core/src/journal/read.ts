import { JournalError } from "./errors";
import { openJournal } from "./runtime";
import { validateFilter, validateQuery } from "./validation";
import type {
  JournalAdapter,
  JournalFilter,
  JournalQuery,
  JournalRecord,
  JournalStats,
} from "./types";

export interface JournalReadOptions {
  filter?: JournalFilter;
  limit?: number;
  cursor?: string;
  includePrompts?: boolean;
  adapter?: JournalAdapter | null;
  env?: Record<string, string | undefined>;
  cwd?: string;
}

/** Opens configured journaling or rejects when it is disabled. */
async function requireJournal(
  options: Pick<JournalReadOptions, "adapter" | "env" | "cwd">,
): Promise<{ adapter: JournalAdapter; owned: boolean }> {
  if (options.adapter !== undefined) {
    if (options.adapter === null)
      throw new JournalError("config", "Journaling is disabled");
    return { adapter: options.adapter, owned: false };
  }
  const adapter = await openJournal({ ...(options.env ? { env: options.env } : {}), ...(options.cwd ? { cwd: options.cwd } : {}) });
  if (!adapter) throw new JournalError("config", "Journaling is disabled");
  return { adapter, owned: true };
}

async function withJournal<T>(
  options: JournalReadOptions,
  read: (adapter: JournalAdapter) => Promise<T>,
): Promise<T> {
  const { adapter, owned } = await requireJournal(options);
  try {
    return await read(adapter);
  } catch (error) {
    // Adapter/runtime exceptions may contain arbitrary remote data. Keep only a
    // generic summary; config and CLI validation errors are raised earlier.
    throw new JournalError("adapter", "Journal read failed", { cause: error });
  } finally {
    if (owned) {
      try {
        await adapter.close();
      } catch {
        // A close failure must not hide a successful read.
      }
    }
  }
}

/** Default reads are summaries; prompts are included only on explicit request. */
export async function readJournalList(
  options: JournalReadOptions = {},
): Promise<{ records: JournalRecord[]; next: string | null }> {
  return withJournal(options, async (adapter) => {
    const query: JournalQuery = {};
    if (options.filter) query.filter = options.filter;
    if (options.limit !== undefined) query.limit = options.limit;
    if (options.cursor !== undefined) query.cursor = options.cursor;
    const page = await adapter.query(validateQuery(query));
    return {
      records: options.includePrompts
        ? page.records
        : page.records.map((record) => {
            const summary = { ...record };
            delete summary.prompt;
            return summary;
          }),
      next: page.next,
    };
  });
}

export async function readJournalStats(
  options: JournalReadOptions = {},
): Promise<JournalStats> {
  return withJournal(options, (adapter) =>
    adapter.stats(validateFilter(options.filter)),
  );
}
