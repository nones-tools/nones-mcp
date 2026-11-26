import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  statSync,
} from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { migrate } from "./sqlite-schema";
import { loadNodeSqlite } from "./sqlite-driver";
import { readPage, readStats } from "./sqlite-query";
import {
  JOURNAL_API_VERSION,
  JournalError,
  decodeCursor,
  utcToMs,
  validateFilter,
  validateQuery,
  validateRecord,
} from "@nones/mcp-core/journal";
import type {
  JournalAdapter,
  JournalFilter,
  JournalPage,
  JournalQuery,
  JournalRecord,
  JournalRecordResult,
  JournalStats,
} from "@nones/mcp-core/journal";


const INSERT_SQL =
  "INSERT INTO journal_entries " +
  "(id, at, at_ms, operation, outcome, duration_ms, session_id, " +
  "session_title, message_id, prompt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
  "ON CONFLICT(id) DO NOTHING";

function isPosix(): boolean {
  return process.platform !== "win32";
}

/**
 * Existing files are never chmodded. Raw prompts are refused when an existing
 * database already grants group or other access.
 */
function assertPrivateFile(pathname: string): void {
  if (!isPosix()) return;
  const mode = statSync(pathname).mode & 0o777;
  if ((mode & 0o077) !== 0)
    throw new JournalError(
      "database",
      `Journal database ${pathname} has unsafe permissions ${mode.toString(8)}; ` +
        "refusing group or other access (chmod 600 the file explicitly)",
    );
}

/** Create the directory 0700 and a new database file 0600 on POSIX. */
function prepareFile(pathname: string): void {
  const directory = path.dirname(pathname);
  try {
    const existed = existsSync(directory);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (!existed && isPosix()) chmodSync(directory, 0o700);
    let created = false;
    try {
      closeSync(openSync(pathname, "wx", 0o600));
      created = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    if (created && isPosix()) chmodSync(pathname, 0o600);
  } catch (error) {
    throw new JournalError(
      "database",
      `Cannot prepare journal database ${pathname}: ${(error as Error).message}`,
      { cause: error },
    );
  }
}

class SqliteJournalAdapter implements JournalAdapter {
  readonly apiVersion = JOURNAL_API_VERSION;
  readonly #path: string;
  #db: DatabaseSync | null;

  constructor(db: DatabaseSync, pathname: string) {
    this.#db = db;
    this.#path = pathname;
  }

  #database(): DatabaseSync {
    if (!this.#db)
      throw new JournalError("closed", "Journal adapter is already closed");
    return this.#db;
  }

  #wrap(error: unknown): never {
    if (error instanceof JournalError) throw error;
    throw new JournalError(
      "database",
      `Journal database ${this.#path}: ${(error as Error).message}`,
      { cause: error },
    );
  }

  async record(value: JournalRecord): Promise<JournalRecordResult> {
    try {
      const record = validateRecord(value);
      const result = this.#database()
        .prepare(INSERT_SQL)
        .run(
          record.id,
          record.at,
          utcToMs(record.at),
          record.operation,
          record.outcome,
          record.durationMs,
          record.sessionId ?? null,
          record.sessionTitle ?? null,
          record.messageId ?? null,
          record.prompt ?? null,
        );
      return { id: record.id, inserted: Number(result.changes) > 0 };
    } catch (error) {
      return this.#wrap(error);
    }
  }

  async query(value?: JournalQuery): Promise<JournalPage> {
    try {
      const query = validateQuery(value);
      return readPage(
        this.#database(),
        query.filter,
        query.limit,
        query.cursor === undefined ? undefined : decodeCursor(query.cursor),
      );
    } catch (error) {
      return this.#wrap(error);
    }
  }

  async stats(value?: JournalFilter): Promise<JournalStats> {
    try {
      return readStats(this.#database(), validateFilter(value));
    } catch (error) {
      return this.#wrap(error);
    }
  }

  async close(): Promise<void> {
    const db = this.#db;
    if (!db) return;
    this.#db = null;
    try {
      db.close();
    } catch (error) {
      this.#wrap(error);
    }
  }
}

/** Opens an independent connection; there is no process-wide singleton. */
export async function openSqliteJournal(
  pathname: string,
): Promise<JournalAdapter> {
  prepareFile(pathname);
  let db: DatabaseSync | undefined;
  try {
    assertPrivateFile(pathname);
    const { DatabaseSync: Database } = await loadNodeSqlite();
    const size = statSync(pathname).size;
    db = new Database(pathname);
    db.exec("PRAGMA busy_timeout = 5000");
    migrate(db, pathname, size);
    return new SqliteJournalAdapter(db, pathname);
  } catch (error) {
    try {
      db?.close();
    } catch {
      // The original open failure is the useful one.
    }
    if (error instanceof JournalError) throw error;
    throw new JournalError(
      "database",
      `Cannot open journal database ${pathname}: ${(error as Error).message}`,
      { cause: error },
    );
  }
}
