import {
  JOURNAL_API_VERSION,
  type JournalAdapter,
  type JournalFilter,
  type JournalPage,
  type JournalQuery,
  type JournalRecord,
  type JournalRecordResult,
  type JournalStats,
} from "./types";
import { validateRecord } from "./validation";

/**
 * Enforces prompt opt-out before any adapter sees the record, including custom
 * adapters that might otherwise write the prompt to a remote store.
 */
export class PromptPolicyAdapter implements JournalAdapter {
  readonly apiVersion = JOURNAL_API_VERSION;
  readonly #inner: JournalAdapter;
  readonly #capturePrompts: boolean;

  constructor(inner: JournalAdapter, capturePrompts: boolean) {
    this.#inner = inner;
    this.#capturePrompts = capturePrompts;
  }

  async record(value: JournalRecord): Promise<JournalRecordResult> {
    const record = validateRecord(value);
    if (!this.#capturePrompts) delete record.prompt;
    return this.#inner.record(record);
  }

  async query(value?: JournalQuery): Promise<JournalPage> {
    return this.#inner.query(value);
  }

  async stats(value?: JournalFilter): Promise<JournalStats> {
    return this.#inner.stats(value);
  }

  async close(): Promise<void> {
    await this.#inner.close();
  }
}
