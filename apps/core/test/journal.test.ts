import { afterEach, describe, expect, test } from "bun:test";
import { stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { openJournal, readJournalList, recordSafely } from "../src/journal/index";
import { makeSandbox, type Sandbox } from "./support";

let sandbox: Sandbox | undefined;

afterEach(async () => {
  sandbox = undefined;
});

function envFor(sandbox: Sandbox): Record<string, string | undefined> {
  return {
    HOME: sandbox.home,
    XDG_CONFIG_HOME: sandbox.xdg,
    XDG_STATE_HOME: path.join(sandbox.root, "state"),
    NONES_CONFIG_DIR: sandbox.configDir,
  };
}

function record(index: number) {
  return {
    id: `record-${index}`,
    at: `2026-01-01T00:00:0${index}.000Z`,
    operation: "opencode.session.send",
    outcome: "success" as const,
    durationMs: index * 10,
    sessionId: "ses_1",
    prompt: `secret prompt ${index}`,
  };
}

describe("journal extraction (core + sqlite adapter)", () => {
  test("records into the built-in SQLite path and excludes prompts on reads by default", async () => {
    sandbox = await makeSandbox();
    const database = path.join(sandbox.root, "journal.sqlite");
    await sandbox.write("config.json", {
      journal: { enabled: true, capturePrompts: true, sqlitePath: database },
    });
    const journal = await openJournal({ env: envFor(sandbox) });
    expect(journal).not.toBeNull();
    const first = await recordSafely(journal, record(1));
    const second = await recordSafely(journal, record(2));
    await journal?.close();
    expect(first).toEqual({ recorded: true, inserted: true, error: null });
    expect(second.inserted).toBe(true);
    expect((await stat(database)).isFile()).toBe(true);

    const summary = await readJournalList({ env: envFor(sandbox) });
    expect(summary.records).toHaveLength(2);
    expect(summary.records.every((entry) => entry.prompt === undefined)).toBe(true);

    const withPrompts = await readJournalList({ env: envFor(sandbox), includePrompts: true });
    expect(withPrompts.records[0]?.prompt).toContain("secret prompt");
  });

  test("capturePrompts=false strips prompts before the adapter sees them", async () => {
    sandbox = await makeSandbox();
    const database = path.join(sandbox.root, "journal.sqlite");
    await sandbox.write("config.json", {
      journal: { enabled: true, capturePrompts: false, sqlitePath: database },
    });
    const journal = await openJournal({ env: envFor(sandbox) });
    await recordSafely(journal, record(3));
    await journal?.close();
    const page = await readJournalList({ env: envFor(sandbox), includePrompts: true });
    expect(page.records[0]?.prompt).toBeUndefined();
  });

  test("reads a previously created 0.5.0 schema database", async () => {
    sandbox = await makeSandbox();
    const database = path.join(sandbox.root, "legacy.sqlite");
    await sandbox.write("config.json", {
      journal: { enabled: true, sqlitePath: database },
    });
    const first = await openJournal({ env: envFor(sandbox) });
    await recordSafely(first, record(4));
    await first?.close();
    // Reopen the same file: schema migration must be a no-op and rows readable.
    const second = await openJournal({ env: envFor(sandbox) });
    const page = await second?.query({});
    expect(page?.records.map((entry) => entry.id)).toEqual(["record-4"]);
    await second?.close();
  });

  test("accepts an installed custom adapter package without downloading", async () => {
    sandbox = await makeSandbox();
    const database = path.join(sandbox.root, "custom.sqlite");
    await sandbox.write("config.json", {
      journal: { enabled: true, adapter: { module: "@nones/mcp-journal-sqlite", options: { path: database } } },
    });
    const journal = await openJournal({ env: envFor(sandbox) });
    expect(journal).not.toBeNull();
    await recordSafely(journal, record(5));
    await journal?.close();
    const page = await readJournalList({ env: envFor(sandbox) });
    expect(page.records).toHaveLength(1);
  });

  test("fails closed for an uninstalled custom adapter", async () => {
    sandbox = await makeSandbox();
    await sandbox.write("config.json", {
      journal: { enabled: true, adapter: { module: "@nones/not-installed-journal" } },
    });
    await expect(openJournal({ env: envFor(sandbox) })).rejects.toThrow(/not installed/);
    // A config error must never create a database.
    await writeFile(path.join(sandbox.root, "marker"), "");
  });
});
