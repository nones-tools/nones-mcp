import type { DatabaseSync } from "node:sqlite";
import { JournalError } from "@nones/mcp-core/journal";

export const SCHEMA_VERSION = 1;
/** ASCII "OMJ1"; distinguishes this database from unrelated SQLite files. */
export const APPLICATION_ID = 0x4f4d4a31;

const REQUIRED_COLUMNS = [
  "id",
  "at",
  "at_ms",
  "operation",
  "outcome",
  "duration_ms",
  "session_id",
  "session_title",
  "message_id",
  "prompt",
];

const CREATE_SQL = `
CREATE TABLE journal_entries (
  id TEXT PRIMARY KEY NOT NULL,
  at TEXT NOT NULL,
  at_ms INTEGER NOT NULL,
  operation TEXT NOT NULL,
  outcome TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  session_id TEXT,
  session_title TEXT,
  message_id TEXT,
  prompt TEXT
);
CREATE INDEX journal_entries_order ON journal_entries (at_ms DESC, id DESC);
CREATE INDEX journal_entries_outcome ON journal_entries (outcome, at_ms DESC);
CREATE INDEX journal_entries_operation ON journal_entries (operation, at_ms DESC);
CREATE INDEX journal_entries_session ON journal_entries (session_id, at_ms DESC);
`;

function pragma(db: DatabaseSync, name: string): number {
  const row = db.prepare(`PRAGMA ${name}`).get() as
    Record<string, unknown> | undefined;
  return Number(row?.[name]);
}

function assertSchema(db: DatabaseSync): void {
  const rows = db.prepare("PRAGMA table_info(journal_entries)").all() as Array<
    Record<string, unknown>
  >;
  const names = new Set(rows.map((row) => String(row.name)));
  for (const column of REQUIRED_COLUMNS) {
    if (!names.has(column))
      throw new JournalError(
        "database",
        `Journal database is missing column ${column}`,
      );
  }
}

/**
 * Opens fail-closed: a newer version, a foreign SQLite database, or a partial
 * schema is rejected without deleting or rewriting the existing bytes.
 */
export function migrate(
  db: DatabaseSync,
  path: string,
  existingBytes: number,
): void {
  const version = pragma(db, "user_version");
  if (version > SCHEMA_VERSION)
    throw new JournalError(
      "database",
      `Journal database ${path} uses schema version ${version}; ` +
        `this build supports ${SCHEMA_VERSION}`,
    );
  if (version === SCHEMA_VERSION) {
    if (pragma(db, "application_id") !== APPLICATION_ID)
      throw new JournalError(
        "database",
        `Journal database ${path} was not created by this journal implementation`,
      );
    assertSchema(db);
    db.exec("PRAGMA journal_mode = WAL");
    return;
  }
  if (version !== 0)
    throw new JournalError(
      "database",
      `Journal database ${path} has unsupported schema version ${version}`,
    );
  if (existingBytes > 0)
    throw new JournalError(
      "database",
      `Journal database ${path} is not an empty or compatible journal file`,
    );
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(CREATE_SQL);
    db.exec(`PRAGMA application_id = ${APPLICATION_ID}`);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Preserve the original failure.
    }
    throw error;
  }
}
