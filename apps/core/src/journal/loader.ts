import { isJournalError, JournalError } from "./errors";
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
 * The default plugin is a subpath of the adapter collection package. Core keeps
 * it optional and resolves it at runtime so the core package stays embeddable
 * with an explicitly installed or injected alternative adapter.
 */
async function sqliteAdapter(path: string): Promise<JournalAdapter> {
  const specifier = "@nones/journal/sqlite";
  let imported: { default?: unknown };
  try {
    // Variable specifier keeps the optional adapter out of core's type graph.
    imported = (await import(specifier)) as typeof imported;
  } catch (error) {
    throw new JournalError(
      "adapter",
      `Default journal adapter ${specifier} is not installed`,
      { cause: error },
    );
  }
  const selected = factory(imported.default, specifier);
  let created: unknown;
  try {
    created = await selected.create({ path });
  } catch (error) {
    // The default plugin reports actionable database/permission JournalErrors.
    if (isJournalError(error)) throw error;
    throw new JournalError(
      "adapter",
      `Default journal adapter ${specifier} failed to create`,
      { cause: error },
    );
  }
  return adapter(created, specifier);
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
