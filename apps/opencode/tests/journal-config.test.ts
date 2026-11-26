import { afterEach, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openJournal } from "../src/journal";
import type { JournalRecord } from "../src/journal";

const roots: string[] = [];

function root(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "journal-config-"));
  roots.push(directory);
  return directory;
}

function writeConfig(directory: string, contents: string): string {
  const configPath = path.join(directory, "cfg", "nones", "config.json");
  mkdirSync(path.dirname(configPath), { recursive: true });
  writeFileSync(configPath, contents);
  return configPath;
}

function writeModule(directory: string, name: string, source: string): string {
  const configDirectory = path.join(directory, "cfg", "nones");
  mkdirSync(configDirectory, { recursive: true });
  const modulePath = path.join(configDirectory, name);
  writeFileSync(modulePath, source);
  return modulePath;
}

function config(directory: string, journal: unknown): string {
  return writeConfig(directory, JSON.stringify({ journal }));
}

function envFor(directory: string, configPath: string): Record<string, string> {
  return {
    HOME: directory,
    XDG_STATE_HOME: path.join(directory, "state"),
    OPENCODE_MCP_CONFIG: configPath,
  };
}

function entry(id: string): JournalRecord {
  return {
    id,
    at: "2026-02-01T00:00:00.000Z",
    operation: "prompt.send",
    outcome: "success",
    durationMs: 7,
    prompt: "synthetic custom prompt",
  };
}

const CUSTOM_MODULE = `
export default {
  apiVersion: 1,
  create(options) {
    if (options?.token !== "trusted" || options?.nested?.value !== 42)
      throw new Error("options were not passed through");
    const records = [];
    let closed = false;
    return {
      apiVersion: 1,
      async record(record) {
        if (closed) throw new Error("adapter closed");
        if (!records.some((item) => item.id === record.id)) records.push(record);
        return { id: record.id, inserted: true };
      },
      async query(query = {}) {
        const limit = query.limit ?? 50;
        const start = Number(query.cursor ?? 0);
        const page = records.slice(start, start + limit);
        return { records: page, next: start + limit < records.length ? String(start + limit) : null };
      },
      async stats() {
        return { total: records.length, firstAt: null, lastAt: null, byOutcome: [], byOperation: [] };
      },
      async close() { closed = true; },
    };
  },
};
`;

afterEach(() => {
  for (const directory of roots.splice(0))
    rmSync(directory, { recursive: true });
});

test("custom modules resolve against config, receive JSON options and work", async () => {
  const directory = root();
  const modulePath = writeModule(directory, "custom.mjs", CUSTOM_MODULE);
  const configPath = config(directory, {
    adapter: {
      module: "./custom.mjs",
      options: { token: "trusted", nested: { value: 42 } },
    },
  });
  const cwd = path.join(directory, "cwd");
  mkdirSync(cwd);
  writeFileSync(
    path.join(cwd, "custom.mjs"),
    'throw new Error("wrong cwd module");',
  );
  writeFileSync(
    path.join(cwd, "adapter.mjs"),
    'throw new Error("wrong cwd module");',
  );
  const adapter = await openJournal({
    env: envFor(directory, configPath),
    cwd,
  });
  expect(adapter).not.toBeNull();
  expect(modulePath).toContain("custom.mjs");
  await adapter!.record(entry("custom-1"));
  const page = await adapter!.query();
  expect(page.records[0].prompt).toBe("synthetic custom prompt");
  expect((await adapter!.stats()).total).toBe(1);
  await adapter!.close();
});

test("disabled journaling opens nothing", async () => {
  const directory = root();
  const configPath = config(directory, { enabled: false });
  const env = envFor(directory, configPath);
  expect(await openJournal({ env })).toBeNull();
  expect(existsSync(env.XDG_STATE_HOME)).toBe(false);
});

test("adapter API version mismatches never fall back to SQLite", async () => {
  const directory = root();
  writeModule(
    directory,
    "version.mjs",
    "export default { apiVersion: 2, create() {} };",
  );
  const versionConfig = config(directory, {
    adapter: { module: "./version.mjs" },
  });
  const env = envFor(directory, versionConfig);
  await expect(openJournal({ env })).rejects.toThrow("apiVersion");
  expect(existsSync(path.join(directory, "state"))).toBe(false);

  const returnedRoot = root();
  writeModule(
    returnedRoot,
    "returned.mjs",
    `export default {
      apiVersion: 1,
      create: () => ({
        apiVersion: 2,
        record() {}, query() {}, stats() {}, close() {}
      })
    };`,
  );
  const returnedConfig = config(returnedRoot, {
    adapter: { module: "./returned.mjs" },
  });
  await expect(
    openJournal({ env: envFor(returnedRoot, returnedConfig) }),
  ).rejects.toThrow("implement apiVersion");

  const missingRoot = root();
  writeModule(missingRoot, "missing.mjs", "export default { apiVersion: 1 };");
  const missingConfig = config(missingRoot, {
    adapter: { module: "./missing.mjs" },
  });
  await expect(
    openJournal({ env: envFor(missingRoot, missingConfig) }),
  ).rejects.toThrow("must default-export");
});

test("invalid adapter options and failed factory creation are surfaced", async () => {
  const directory = root();
  writeModule(directory, "options.mjs", CUSTOM_MODULE);
  const badOptions = config(directory, {
    adapter: { module: "./options.mjs", options: { token: "untrusted" } },
  });
  await expect(
    openJournal({ env: envFor(directory, badOptions) }),
  ).rejects.toThrow("failed to create");

  writeModule(
    directory,
    "throws.mjs",
    'export default { apiVersion: 1, create() { throw new Error("boom"); } };',
  );
  const thrown = config(directory, {
    adapter: { module: "./throws.mjs" },
  });
  await expect(openJournal({ env: envFor(directory, thrown) })).rejects.toThrow(
    "failed to create",
  );
});
