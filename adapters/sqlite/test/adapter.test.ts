import { afterAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import adapterFactory, { openSqliteJournal, APPLICATION_ID, SCHEMA_VERSION } from "../src/index";

await mkdir(path.join(import.meta.dir, "..", "..", "..", ".tmp"), { recursive: true });
const root = await mkdtemp(path.join(import.meta.dir, "..", "..", "..", ".tmp", "sqlite-adapter-"));
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
