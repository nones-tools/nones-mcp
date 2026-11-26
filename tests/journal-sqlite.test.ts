import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openJournal } from "../src/journal";
import type { JournalRecord } from "../src/journal";

const roots: string[] = [];

function root(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "journal-sqlite-"));
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

test("records persist across independent connections", async () => {
  const directory = root();
  const env = envFor(directory);
  const first = await openJournal({ env });
  expect(first).not.toBeNull();
  await first!.record(entry("a", 1));
  await first!.record(entry("b", 2, { operation: "session.open" }));
  await first!.record(entry("c", 3));
  await first!.close();
  await first!.close();

  const second = await openJournal({ env });
  const page = await second!.query();
  expect(page.records.map((record) => record.id)).toEqual(["c", "b", "a"]);
  expect(page.records[1].operation).toBe("session.open");
  await second!.close();
  expect(
    existsSync(path.join(env.XDG_STATE_HOME, "nones", "journal.sqlite")),
  ).toBe(true);
});

test("bounded pagination is stable across restarts", async () => {
  const directory = root();
  const env = envFor(directory);
  const first = await openJournal({ env });
  for (let index = 0; index < 7; index += 1)
    await first!.record(entry(`p${index}`, index));
  const page = await first!.query({ limit: 2 });
  expect(page.records.map((record) => record.id)).toEqual(["p6", "p5"]);
  expect(page.next).not.toBeNull();
  await first!.close();

  const second = await openJournal({ env });
  const ids: string[] = page.records.map((record) => record.id);
  let cursor = page.next;
  while (cursor !== null) {
    const next = await second!.query({ limit: 2, cursor });
    ids.push(...next.records.map((record) => record.id));
    cursor = next.next;
  }
  expect(ids).toEqual(["p6", "p5", "p4", "p3", "p2", "p1", "p0"]);
  await expect(second!.query({ limit: 201 })).rejects.toThrow("limit");
  await expect(second!.query({ cursor: "not a cursor" })).rejects.toThrow(
    "Invalid journal cursor",
  );
  await second!.close();
});

test("tie order and filters are deterministic", async () => {
  const directory = root();
  const env = envFor(directory);
  const adapter = await openJournal({ env });
  await adapter!.record(entry("a", 0, { durationMs: 10, sessionId: "s1" }));
  await adapter!.record(entry("b", 1, { durationMs: 20, sessionId: "s1" }));
  await adapter!.record(
    entry("c", 2, {
      operation: "session.open",
      durationMs: 30,
      sessionId: "s2",
    }),
  );
  await adapter!.record(
    entry("d", 3, {
      operation: "session.close",
      outcome: "cancelled",
      durationMs: 40,
      sessionId: "s2",
    }),
  );
  await adapter!.record(entry("t-a", 4));
  await adapter!.record(entry("t-b", 4));

  const all = await adapter!.query();
  expect(all.records.slice(0, 2).map((record) => record.id)).toEqual([
    "t-b",
    "t-a",
  ]);
  const prefix = await adapter!.query({
    filter: { operationPrefix: "session." },
  });
  expect(prefix.records.map((record) => record.id)).toEqual(["d", "c"]);
  const session = await adapter!.query({ filter: { sessionId: "s1" } });
  expect(session.records.map((record) => record.id)).toEqual(["b", "a"]);
  const failures = await adapter!.query({ filter: { outcome: "failure" } });
  expect(failures.records).toEqual([]);
  const window = await adapter!.query({
    filter: { from: at(1), to: at(3) },
  });
  expect(window.records.map((record) => record.id)).toEqual(["c", "b"]);
  await adapter!.close();
});
