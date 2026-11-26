import { resolveJournalConfig } from "./config";
import { createJournalAdapter } from "./loader";
import { PromptPolicyAdapter } from "./policy";
import type { JournalAdapter, JournalRecord } from "./types";
import type { SafeRecordResult } from "./sink";

export interface OpenJournalOptions {
  env?: Record<string, string | undefined>;
  cwd?: string;
}

export type { SafeRecordResult } from "./sink";

/**
 * Journaling is secondary to the native action. Call this after the action is
 * acknowledged so a logging failure can never trigger a duplicate retry.
 */
export async function recordSafely(
  adapter: JournalAdapter | null,
  record: JournalRecord,
): Promise<SafeRecordResult> {
  if (adapter === null)
    return { recorded: false, inserted: false, error: null };
  try {
    const result = await adapter.record(record);
    return { recorded: true, inserted: result.inserted, error: null };
  } catch (error) {
    return {
      recorded: false,
      inserted: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Opens a fresh adapter per call. Returns null when journaling is disabled.
 * No database is opened here for disabled configs or CLI help paths.
 */
export async function openJournal(
  options: OpenJournalOptions = {},
): Promise<JournalAdapter | null> {
  const settings = await resolveJournalConfig(
    options.env ?? process.env,
    options.cwd ?? process.cwd(),
  );
  if (!settings.enabled) return null;
  const adapter = await createJournalAdapter(settings);
  return new PromptPolicyAdapter(adapter, settings.capturePrompts);
}
