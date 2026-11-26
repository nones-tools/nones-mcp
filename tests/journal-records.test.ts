import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openJournal, recordSafely } from "../src/journal";
import type { JournalRecord } from "../src/journal";

const roots: string[] = [];

function root(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "journal-records-"));
  roots.push(directory);
  return directory;
}

function envFor(directory: string): Record<string, string> {
  return {
    HOME: directory,
    XDG_STATE_HOME: path.join(directory, "state"),
    XDG_CONFIG_HOME: path.join(directory, "config"),
  };
}

function at(seconds: number): string {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString();
}

function entry(
  id: string,
  seconds: number,
  extra: Partial<JournalRecord> = {},
): JournalRecord {
  return {
    id,
    at: at(seconds),
    operation: "tool.call",
    outcome: "success",
    durationMs: 10,
    ...extra,
  };
}

afterEach(() => {
  for (const directory of roots.splice(0))
    rmSync(directory, { recursive: true });
});

test("stats are deterministic and respect filters", async () => {
  const directory = root();
  const env = envFor(directory);
  const adapter = await openJournal({ env });
  await adapter!.record(entry("a", 0, { durationMs: 10 }));
  await adapter!.record(entry("b", 1, { durationMs: 20 }));
  await adapter!.record(
    entry("c", 2, { operation: "session.open", durationMs: 30 }),
  );
  const stats = await adapter!.stats();
  expect(stats.total).toBe(3);
  expect(stats.firstAt).toBe(at(0));
  expect(stats.lastAt).toBe(at(2));
  expect(stats.byOperation).toEqual([
    { operation: "tool.call", count: 2, averageDurationMs: 15 },
    { operation: "session.open", count: 1, averageDurationMs: 30 },
  ]);
  expect(stats.byOutcome).toEqual([{ outcome: "success", count: 3 }]);
  await adapter!.close();

  const reopened = await openJournal({ env });
  expect(await reopened!.stats()).toEqual(stats);
  expect((await reopened!.stats({ operationPrefix: "tool." })).total).toBe(2);
  await reopened!.close();
});

test("record IDs are idempotent and concurrent writes survive", async () => {
  const directory = root();
  const env = envFor(directory);
  const first = await openJournal({ env });
  const second = await openJournal({ env });
  expect(
    await first!.record(entry("same", 0, { prompt: "first prompt" })),
  ).toEqual({ id: "same", inserted: true });
  expect(
    await first!.record(entry("same", 1, { prompt: "second prompt" })),
  ).toEqual({ id: "same", inserted: false });
  const writes = Array.from({ length: 20 }, (_, index) =>
    (index % 2 === 0 ? first! : second!).record(entry(`w${index}`, 10 + index)),
  );
  await Promise.all(writes);
  await first!.close();
  await second!.close();

  const reopened = await openJournal({ env });
  const page = await reopened!.query({ limit: 200 });
  expect(page.records).toHaveLength(21);
  const duplicate = page.records.find((record) => record.id === "same");
  expect(duplicate?.prompt).toBe("first prompt");
  await reopened!.close();

  const { DatabaseSync } = await import("node:sqlite");
  const file = path.join(env.XDG_STATE_HOME, "nones", "journal.sqlite");
  const db = new DatabaseSync(file);
  expect(db.prepare("PRAGMA journal_mode").get()).toMatchObject({
    journal_mode: "wal",
  });
  db.close();
});

test("safe recording never turns a journal failure into an action failure", async () => {
  const directory = root();
  const env = envFor(directory);
  const adapter = await openJournal({ env });
  await adapter!.close();
  const failed = await recordSafely(adapter, entry("late", 0));
  expect(failed.recorded).toBe(false);
  expect(failed.error).toContain("already closed");
  expect(await recordSafely(null, entry("disabled", 0))).toEqual({
    recorded: false,
    inserted: false,
    error: null,
  });
});
