import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openJournal, readJournalList, readJournalStats } from "../src/journal";
import type { JournalRecord } from "../src/journal";

const roots: string[] = [];

function root(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "journal-cli-reads-"));
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
    operation: "opencode.session.send",
    outcome: "success",
    durationMs: 10,
    ...extra,
  };
}

async function seed(env: Record<string, string>): Promise<void> {
  const adapter = await openJournal({ env });
  await adapter!.record(
    entry("a", 0, { prompt: "first synthetic prompt", sessionId: "s1" }),
  );
  await adapter!.record(
    entry("b", 1, {
      operation: "opencode.session.status",
      outcome: "failure",
      durationMs: 20,
      sessionId: "s1",
    }),
  );
  await adapter!.record(
    entry("c", 2, {
      operation: "opencode.service.start",
      durationMs: 30,
    }),
  );
  await adapter!.close();
}

afterEach(() => {
  for (const directory of roots.splice(0))
    rmSync(directory, { recursive: true });
});

test("list omits prompts by default and supports explicit inclusion", async () => {
  const directory = root();
  const env = envFor(directory);
  await seed(env);
  const summary = await readJournalList({ env });
  expect(summary.records.map((record) => record.id)).toEqual(["c", "b", "a"]);
  expect(summary.records[0].prompt).toBeUndefined();
  const full = await readJournalList({ env, includePrompts: true });
  expect(full.records[2].prompt).toBe("first synthetic prompt");
});

test("list applies filters, bounds and cursors", async () => {
  const directory = root();
  const env = envFor(directory);
  await seed(env);
  const first = await readJournalList({
    env,
    filter: { operationPrefix: "opencode.session." },
    limit: 1,
  });
  expect(first.records.map((record) => record.id)).toEqual(["b"]);
  expect(first.next).not.toBeNull();
  const second = await readJournalList({
    env,
    filter: { operationPrefix: "opencode.session." },
    limit: 1,
    cursor: first.next!,
  });
  expect(second.records.map((record) => record.id)).toEqual(["a"]);
  expect(second.next).toBeNull();
  const failed = await readJournalList({
    env,
    filter: { outcome: "failure" },
  });
  expect(failed.records.map((record) => record.id)).toEqual(["b"]);
});

test("stats honor bounded filters", async () => {
  const directory = root();
  const env = envFor(directory);
  await seed(env);
  const stats = await readJournalStats({
    env,
    filter: { operationPrefix: "opencode.session." },
  });
  expect(stats.total).toBe(2);
  expect(stats.byOutcome).toEqual([
    { outcome: "failure", count: 1 },
    { outcome: "success", count: 1 },
  ]);
  expect(stats.byOperation).toEqual([
    {
      operation: "opencode.session.send",
      count: 1,
      averageDurationMs: 10,
    },
    {
      operation: "opencode.session.status",
      count: 1,
      averageDurationMs: 20,
    },
  ]);
});
