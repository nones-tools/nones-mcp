import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openJournal } from "../src/journal";

const roots: string[] = [];

function root(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "journal-invalid-"));
  roots.push(directory);
  return directory;
}

function writeConfig(directory: string, contents: string): string {
  const configPath = path.join(directory, "cfg", "nones", "config.json");
  mkdirSync(path.dirname(configPath), { recursive: true });
  writeFileSync(configPath, contents);
  return configPath;
}

function envFor(directory: string, configPath: string): Record<string, string> {
  return {
    HOME: directory,
    XDG_STATE_HOME: path.join(directory, "state"),
    OPENCODE_MCP_CONFIG: configPath,
  };
}

afterEach(() => {
  for (const directory of roots.splice(0))
    rmSync(directory, { recursive: true });
});

test("invalid config and adapter selections fail closed", async () => {
  const cases = [
    { text: "{", error: /not valid JSON/ },
    {
      text: JSON.stringify({ journal: { enabled: "yes" } }),
      error: /enabled must be a boolean/,
    },
    {
      text: JSON.stringify({ journal: { adapter: {} } }),
      error: /module must be a non-empty string/,
    },
    {
      text: JSON.stringify({
        journal: {
          sqlitePath: "/tmp/x.sqlite",
          adapter: { module: "./a.mjs" },
        },
      }),
      error: /mutually exclusive/,
    },
    {
      text: JSON.stringify({ journal: { mystery: true } }),
      error: /is not supported/,
    },
    {
      text: JSON.stringify({ journal: { adapter: { module: "a.mjs" } } }),
      error: /absolute path/,
    },
    { text: "[]", error: /JSON object/ },
  ];
  for (const item of cases) {
    const directory = root();
    const configPath = writeConfig(directory, item.text);
    await expect(
      openJournal({ env: envFor(directory, configPath) }),
    ).rejects.toThrow(item.error);
  }
});

test("an explicitly selected missing config file is an error", async () => {
  const directory = root();
  await expect(
    openJournal({
      env: envFor(directory, path.join(directory, "missing.json")),
    }),
  ).rejects.toThrow("not found");
});

test("default config path follows XDG_CONFIG_HOME/nones/config.json", async () => {
  const directory = root();
  const xdg = path.join(directory, "xdg");
  const configPath = path.join(xdg, "nones", "config.json");
  mkdirSync(path.dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify({ journal: { enabled: false } }));
  const env: Record<string, string> = {
    HOME: directory,
    XDG_STATE_HOME: path.join(directory, "state"),
    XDG_CONFIG_HOME: xdg,
  };
  expect(await openJournal({ env })).toBeNull();
});

test("a missing custom adapter module fails clearly", async () => {
  const directory = root();
  const configPath = writeConfig(
    directory,
    JSON.stringify({ journal: { adapter: { module: "./absent.mjs" } } }),
  );
  await expect(
    openJournal({ env: envFor(directory, configPath) }),
  ).rejects.toThrow("Cannot load custom journal adapter");
});
