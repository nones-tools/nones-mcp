import { afterEach, expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { MAX_PROMPT_BYTES, openJournal } from "../src/journal";
import type { JournalRecord } from "../src/journal";

const roots: string[] = [];

function root(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "journal-privacy-"));
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

function configFor(directory: string, journal: unknown): string {
  const configPath = path.join(directory, "config", "nones", "config.json");
  mkdirSync(path.dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify({ journal }));
  return configPath;
}

function entry(id: string, prompt?: string): JournalRecord {
  return {
    id,
    at: "2026-01-01T00:00:00.000Z",
    operation: "prompt.send",
    outcome: "success",
    durationMs: 5,
    ...(prompt === undefined ? {} : { prompt }),
  };
}

afterEach(() => {
  for (const directory of roots.splice(0))
    rmSync(directory, { recursive: true });
});

test("new state directory and database file are private on POSIX", async () => {
  const directory = root();
  const env = envFor(directory);
  const adapter = await openJournal({ env });
  await adapter!.record(entry("private"));
  await adapter!.close();
  if (process.platform === "win32") return;
  const dir = path.join(env.XDG_STATE_HOME, "nones");
  const file = path.join(dir, "journal.sqlite");
  expect(statSync(dir).mode & 0o777).toBe(0o700);
  expect(statSync(file).mode & 0o777).toBe(0o600);
});

test("prompts are captured by default and omitted when disabled", async () => {
  const capturedRoot = root();
  const captured = await openJournal({ env: envFor(capturedRoot) });
  await captured!.record(entry("captured", "synthetic user prompt"));
  const page = await captured!.query();
  expect(page.records[0].prompt).toBe("synthetic user prompt");
  await captured!.close();

  const optOutRoot = root();
  const configPath = configFor(optOutRoot, { capturePrompts: false });
  const env: Record<string, string> = {
    ...envFor(optOutRoot),
    OPENCODE_MCP_CONFIG: configPath,
  };
  const optOut = await openJournal({ env });
  await optOut!.record({
    ...entry("opt-out", "must never be stored"),
    stdout: "secret tool output",
  } as never);
  const stored = await optOut!.query();
  expect(stored.records[0].prompt).toBeUndefined();
  expect("stdout" in stored.records[0]).toBe(false);
  await optOut!.close();

  const { DatabaseSync } = await import("node:sqlite");
  const file = path.join(env.XDG_STATE_HOME, "nones", "journal.sqlite");
  const db = new DatabaseSync(file);
  const row = db.prepare("SELECT prompt FROM journal_entries").get() as {
    prompt: unknown;
  };
  expect(row.prompt).toBeNull();
  db.close();
});

test("oversized entries and use after close fail closed", async () => {
  const directory = root();
  const adapter = await openJournal({ env: envFor(directory) });
  await expect(
    adapter!.record(entry("too-big", "x".repeat(MAX_PROMPT_BYTES + 1))),
  ).rejects.toThrow("prompt exceeds");
  await adapter!.close();
  await adapter!.close();
  await expect(adapter!.record(entry("closed"))).rejects.toThrow(
    "already closed",
  );
});

test("incompatible and newer database bytes are preserved", async () => {
  const directory = root();
  const env = envFor(directory);
  const garbage = path.join(directory, "garbage", "journal.sqlite");
  mkdirSync(path.dirname(garbage), { recursive: true });
  writeFileSync(garbage, "this is not a sqlite database");
  if (process.platform !== "win32") chmodSync(garbage, 0o600);
  const before = readFileSync(garbage);
  const garbageConfig = configFor(directory, { sqlitePath: garbage });
  await expect(
    openJournal({ env: { ...env, OPENCODE_MCP_CONFIG: garbageConfig } }),
  ).rejects.toThrow(/journal database/);
  expect(readFileSync(garbage)).toEqual(before);

  const newer = path.join(directory, "newer", "journal.sqlite");
  mkdirSync(path.dirname(newer), { recursive: true });
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(newer);
  db.exec("PRAGMA user_version = 2");
  db.close();
  if (process.platform !== "win32") chmodSync(newer, 0o600);
  const newerBefore = readFileSync(newer);
  const newerConfig = configFor(directory, { sqlitePath: newer });
  await expect(
    openJournal({ env: { ...env, OPENCODE_MCP_CONFIG: newerConfig } }),
  ).rejects.toThrow("schema version 2");
  expect(readFileSync(newer)).toEqual(newerBefore);
});

test("existing databases with unsafe permissions are refused, not chmodded", async () => {
  if (process.platform === "win32") return;
  const directory = root();
  const env = envFor(directory);
  const adapter = await openJournal({ env });
  await adapter!.record(entry("existing"));
  await adapter!.close();
  const file = path.join(env.XDG_STATE_HOME, "nones", "journal.sqlite");
  chmodSync(file, 0o644);
  const before = readFileSync(file);
  await expect(openJournal({ env })).rejects.toThrow(/unsafe permissions/);
  expect(statSync(file).mode & 0o777).toBe(0o644);
  expect(readFileSync(file)).toEqual(before);
});
