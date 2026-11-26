import { JournalError } from "./errors";
import type { JournalSettings } from "./config";
import {
  JOURNAL_API_VERSION,
  type JournalAdapter,
  type JournalAdapterFactory,
} from "./types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function factory(value: unknown, moduleUrl: string): JournalAdapterFactory {
  if (
    !isObject(value) ||
    value.apiVersion !== JOURNAL_API_VERSION ||
    typeof value.create !== "function"
  )
    throw new JournalError(
      "adapter",
      `Custom journal adapter ${moduleUrl} must default-export ` +
        `{ apiVersion: ${JOURNAL_API_VERSION}, create(options) }`,
    );
  return value as unknown as JournalAdapterFactory;
}

function adapter(value: unknown, moduleUrl: string): JournalAdapter {
  if (
    !isObject(value) ||
    value.apiVersion !== JOURNAL_API_VERSION ||
    typeof value.record !== "function" ||
    typeof value.query !== "function" ||
    typeof value.stats !== "function" ||
    typeof value.close !== "function"
  )
    throw new JournalError(
      "adapter",
      `Custom journal adapter ${moduleUrl} must implement apiVersion ` +
        `${JOURNAL_API_VERSION} and record/query/stats/close`,
    );
  return value as unknown as JournalAdapter;
}

async function customAdapter(
  settings: JournalSettings,
): Promise<JournalAdapter> {
  const selection = settings.adapter;
  if (!selection) throw new JournalError("adapter", "No adapter selected");
  let imported: unknown;
  try {
    imported = await import(selection.moduleUrl);
  } catch (error) {
    throw new JournalError(
      "adapter",
      `Cannot load custom journal adapter ${selection.moduleUrl}`,
      { cause: error },
    );
  }
  const exported = (imported as { default?: unknown }).default;
  const selected = factory(exported, selection.moduleUrl);
  let created: unknown;
  try {
    created = await selected.create(selection.options);
  } catch (error) {
    throw new JournalError(
      "adapter",
      `Custom journal adapter ${selection.moduleUrl} failed to create`,
      { cause: error },
    );
  }
  return adapter(created, selection.moduleUrl);
}

/**
 * Built-in SQLite lives in an optional package so core does not depend on a
 * driver. Installation is explicit; nothing is downloaded at runtime.
 */
async function sqliteAdapter(path: string): Promise<JournalAdapter> {
  let imported: { openSqliteJournal?: (path: string) => JournalAdapter };
  try {
    // Variable specifier keeps the optional adapter out of core's type graph.
    const specifier = "@nones/mcp-journal-sqlite";
    imported = (await import(specifier)) as typeof imported;
  } catch (error) {
    throw new JournalError(
      "adapter",
      "Built-in journal adapter @nones/mcp-journal-sqlite is not installed",
      { cause: error },
    );
  }
  if (typeof imported.openSqliteJournal !== "function")
    throw new JournalError(
      "adapter",
      "@nones/mcp-journal-sqlite does not export openSqliteJournal",
    );
  return imported.openSqliteJournal(path);
}

/** Selects exactly what config requested; never silently falls back to SQLite. */
export async function createJournalAdapter(
  settings: JournalSettings,
): Promise<JournalAdapter> {
  if (settings.adapter !== null) return customAdapter(settings);
  if (settings.sqlitePath === null)
    throw new JournalError("config", "No journal adapter configured");
  return sqliteAdapter(settings.sqlitePath);
}
