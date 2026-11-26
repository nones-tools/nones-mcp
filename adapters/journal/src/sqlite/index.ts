import { openSqliteJournal } from "./sqlite";

export { openSqliteJournal } from "./sqlite";
export { JournalError, type JournalErrorCode } from "@nones/mcp-core/journal";
export { SCHEMA_VERSION, APPLICATION_ID } from "./sqlite-schema";
export type {
  JournalAdapter,
  JournalAdapterFactory,
  JournalFilter,
  JournalPage,
  JournalQuery,
  JournalRecord,
  JournalRecordResult,
  JournalStats,
} from "@nones/mcp-core/journal";

interface SqliteAdapterOptions {
  path?: unknown;
  sqlitePath?: unknown;
}

function pathFrom(options: unknown): string {
  if (typeof options === "string" && options.length > 0) return options;
  if (typeof options === "object" && options !== null) {
    const candidate = options as SqliteAdapterOptions;
    const value = candidate.path ?? candidate.sqlitePath;
    if (typeof value === "string" && value.length > 0) return value;
  }
  throw new Error(
    "SQLite journal adapter options must be { path } (absolute) or a non-empty path string",
  );
}

/** Default export for the custom-adapter v1 contract (`create(options)`). */
export const adapterFactory = {
  apiVersion: 1 as const,
  create(options: unknown) {
    return openSqliteJournal(pathFrom(options));
  },
};

export default adapterFactory;
