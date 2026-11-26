import type { DatabaseSync } from "node:sqlite";
import { encodeCursor, type JournalCursor } from "@nones/mcp-core/journal";
import type {
  JournalFilter,
  JournalOperationCount,
  JournalOutcome,
  JournalOutcomeCount,
  JournalPage,
  JournalRecord,
  JournalStats,
} from "@nones/mcp-core/journal";
import { utcToMs } from "@nones/mcp-core/journal";

type Row = Record<string, unknown>;

interface Where {
  sql: string;
  params: (string | number)[];
}

export function buildWhere(
  filter: JournalFilter,
  cursor?: JournalCursor,
): Where {
  const clauses: string[] = [];
  const params: (string | number)[] = [];
  if (filter.operation !== undefined) {
    clauses.push("operation = ?");
    params.push(filter.operation);
  }
  if (filter.operationPrefix !== undefined) {
    clauses.push("substr(operation, 1, ?) = ?");
    params.push(filter.operationPrefix.length, filter.operationPrefix);
  }
  if (filter.outcome !== undefined) {
    clauses.push("outcome = ?");
    params.push(filter.outcome);
  }
  if (filter.sessionId !== undefined) {
    clauses.push("session_id = ?");
    params.push(filter.sessionId);
  }
  if (filter.from !== undefined) {
    clauses.push("at_ms >= ?");
    params.push(utcToMs(filter.from));
  }
  if (filter.to !== undefined) {
    clauses.push("at_ms < ?");
    params.push(utcToMs(filter.to));
  }
  if (cursor !== undefined) {
    clauses.push("(at_ms < ? OR (at_ms = ? AND id < ?))");
    params.push(cursor.atMs, cursor.atMs, cursor.id);
  }
  return {
    sql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

export function rowToRecord(row: Row): JournalRecord {
  const record: JournalRecord = {
    id: String(row.id),
    at: String(row.at),
    operation: String(row.operation),
    outcome: String(row.outcome) as JournalOutcome,
    durationMs: Number(row.duration_ms),
  };
  if (row.session_id !== null && row.session_id !== undefined)
    record.sessionId = String(row.session_id);
  if (row.session_title !== null && row.session_title !== undefined)
    record.sessionTitle = String(row.session_title);
  if (row.message_id !== null && row.message_id !== undefined)
    record.messageId = String(row.message_id);
  if (row.prompt !== null && row.prompt !== undefined)
    record.prompt = String(row.prompt);
  return record;
}

const COLUMNS =
  "id, at, at_ms, operation, outcome, duration_ms, session_id, session_title, message_id, prompt";

export function readPage(
  db: DatabaseSync,
  filter: JournalFilter,
  limit: number,
  cursor?: JournalCursor,
): JournalPage {
  const where = buildWhere(filter, cursor);
  const rows = db
    .prepare(
      `SELECT ${COLUMNS} FROM journal_entries ${where.sql} ` +
        "ORDER BY at_ms DESC, id DESC LIMIT ?",
    )
    .all(...where.params, limit + 1) as Row[];
  const records = rows.slice(0, limit).map(rowToRecord);
  const last = records.at(-1);
  return {
    records,
    next:
      rows.length > limit && last
        ? encodeCursor({ atMs: utcToMs(last.at), id: last.id })
        : null,
  };
}

export function readStats(
  db: DatabaseSync,
  filter: JournalFilter,
): JournalStats {
  const where = buildWhere(filter);
  const totals = db
    .prepare(
      "SELECT COUNT(*) AS total, MIN(at) AS first_at, MAX(at) AS last_at " +
        `FROM journal_entries ${where.sql}`,
    )
    .get(...where.params) as Row;
  const outcomes = db
    .prepare(
      `SELECT outcome, COUNT(*) AS count FROM journal_entries ${where.sql} ` +
        "GROUP BY outcome ORDER BY count DESC, outcome ASC",
    )
    .all(...where.params) as Row[];
  const operations = db
    .prepare(
      "SELECT operation, COUNT(*) AS count, AVG(duration_ms) AS average " +
        `FROM journal_entries ${where.sql} GROUP BY operation ` +
        "ORDER BY count DESC, operation ASC",
    )
    .all(...where.params) as Row[];
  return {
    total: Number(totals.total),
    firstAt: totals.first_at === null ? null : String(totals.first_at),
    lastAt: totals.last_at === null ? null : String(totals.last_at),
    byOutcome: outcomes.map((row): JournalOutcomeCount => ({
      outcome: String(row.outcome) as JournalOutcome,
      count: Number(row.count),
    })),
    byOperation: operations.map((row): JournalOperationCount => ({
      operation: String(row.operation),
      count: Number(row.count),
      averageDurationMs: Math.round(Number(row.average) * 10) / 10,
    })),
  };
}
