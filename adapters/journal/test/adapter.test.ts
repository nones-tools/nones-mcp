import { afterAll, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import adapterFactory, {
  APPLICATION_ID,
  SCHEMA_VERSION,
  adapterFactory as namedAdapterFactory,
  openSqliteJournal,
} from "../src/sqlite/index";

await mkdir(path.join(import.meta.dir, "..", "..", "..", ".tmp"), { recursive: true });
const root = await mkdtemp(path.join(import.meta.dir, "..", "..", "..", ".tmp", "journal-adapter-"));
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

function record(id: string) {
  return {
    id,
    at: "2026-01-01T00:00:00.000Z",
    operation: "opencode.session.send",
    outcome: "success" as const,
    durationMs: 5,
    prompt: "hello",
  };
}

test("creates the v1 schema and reads a previously written database", async () => {
  const database = path.join(root, "journal.sqlite");
  const first = await openSqliteJournal(database);
  expect(await first.record(record("a"))).toEqual({ id: "a", inserted: true });
  expect(await first.record(record("a"))).toEqual({ id: "a", inserted: false });
  await first.close();

  const raw = new DatabaseSync(database);
  const applicationId = raw.prepare("PRAGMA application_id").get() as Record<string, number>;
  const version = raw.prepare("PRAGMA user_version").get() as Record<string, number>;
  raw.close();
  expect(Number(Object.values(applicationId)[0])).toBe(APPLICATION_ID);
  expect(Number(Object.values(version)[0])).toBe(SCHEMA_VERSION);

  const second = await openSqliteJournal(database);
  const page = await second.query({});
  expect(page.records.map((entry) => entry.id)).toEqual(["a"]);
  await second.close();
});

test("default factory implements the custom adapter v1 contract", async () => {
  const database = path.join(root, "factory.sqlite");
  expect(adapterFactory.apiVersion).toBe(1);
  const adapter = await adapterFactory.create({ path: database });
  expect(adapter.apiVersion).toBe(1);
  await adapter.record(record("b"));
  await adapter.close();
});

test("the default export is also available as the named adapterFactory", () => {
  expect(namedAdapterFactory).toBe(adapterFactory);
});

test("reads a database written by the 0.5.0 journal schema", async () => {
  const database = path.join(root, "legacy.sqlite");
  const raw = new DatabaseSync(database);
  raw.exec(`
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
    PRAGMA application_id = ${APPLICATION_ID};
    PRAGMA user_version = ${SCHEMA_VERSION};
  `);
  raw
    .prepare(
      "INSERT INTO journal_entries " +
        "(id, at, at_ms, operation, outcome, duration_ms, session_id, " +
        "session_title, message_id, prompt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      "legacy-1",
      "2026-01-01T00:00:00.000Z",
      1767225600000,
      "opencode.session.send",
      "success",
      5,
      null,
      null,
      null,
      "from 0.5.0",
    );
  raw.close();
  await chmod(database, 0o600);

  const journal = await openSqliteJournal(database);
  const page = await journal.query({});
  expect(page.records).toEqual([
    {
      id: "legacy-1",
      at: "2026-01-01T00:00:00.000Z",
      operation: "opencode.session.send",
      outcome: "success",
      durationMs: 5,
      prompt: "from 0.5.0",
    },
  ]);
  await journal.close();

  const reopened = await openSqliteJournal(database);
  expect(await reopened.record(record("legacy-2"))).toEqual({
    id: "legacy-2",
    inserted: true,
  });
  await reopened.close();
});
