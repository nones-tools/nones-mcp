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
import { Command } from "commander";
import { openJournal, registerJournalCommands } from "../src/journal";

const roots: string[] = [];

function root(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "journal-cli-register-"));
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

function syntheticConfig(directory: string, contents: string): string {
  const configPath = path.join(directory, "synthetic", "config.json");
  mkdirSync(path.dirname(configPath), { recursive: true });
  writeFileSync(configPath, contents);
  return configPath;
}

async function seed(env: Record<string, string>): Promise<void> {
  const adapter = await openJournal({ env });
  await adapter!.record({
    id: "send-1",
    at: "2026-01-01T00:00:02.000Z",
    operation: "opencode.session.send",
    outcome: "success",
    durationMs: 10,
    prompt: "synthetic command prompt",
  });
  await adapter!.record({
    id: "status-1",
    at: "2026-01-01T00:00:01.000Z",
    operation: "opencode.session.status",
    outcome: "success",
    durationMs: 20,
  });
  await adapter!.close();
}

function commandFor(
  env: Record<string, string>,
  out: string[],
  err: string[],
  codes: number[],
): Command {
  const program = new Command();
  registerJournalCommands(program, {
    env,
    out: (text) => out.push(text),
    err: (text) => err.push(text),
    setExitCode: (code) => codes.push(code),
  });
  return program;
}

afterEach(() => {
  for (const directory of roots.splice(0))
    rmSync(directory, { recursive: true });
});

test("registered list command prints JSON and honors --include-prompts", async () => {
  const directory = root();
  const env = envFor(directory);
  await seed(env);
  const out: string[] = [];
  const err: string[] = [];
  const codes: number[] = [];
  const program = commandFor(env, out, err, codes);
  await program.parseAsync(
    [
      "journal",
      "list",
      "--operation",
      "opencode.session.send",
      "--include-prompts",
    ],
    { from: "user" },
  );
  const page = JSON.parse(out[0]);
  expect(page.records).toHaveLength(1);
  expect(page.records[0].id).toBe("send-1");
  expect(page.records[0].prompt).toBe("synthetic command prompt");
  expect(page.next).toBeNull();
  expect(err).toEqual([]);
  expect(codes).toEqual([]);
});

test("registered stats command prints aggregates without prompts", async () => {
  const directory = root();
  const env = envFor(directory);
  await seed(env);
  const out: string[] = [];
  const program = commandFor(env, out, [], []);
  await program.parseAsync(["journal", "stats"], { from: "user" });
  const stats = JSON.parse(out[0]);
  expect(stats.total).toBe(2);
  expect(JSON.stringify(stats)).not.toContain("synthetic command prompt");
});

test("synthetic disabled config makes CLI journaling a no-op", async () => {
  const directory = root();
  const configPath = syntheticConfig(
    directory,
    JSON.stringify({ journal: { enabled: false } }),
  );
  const env: Record<string, string> = {
    ...envFor(directory),
    OPENCODE_MCP_CONFIG: configPath,
  };
  const out: string[] = [];
  const err: string[] = [];
  const codes: number[] = [];
  const program = commandFor(env, out, err, codes);
  await program.parseAsync(["journal", "list"], { from: "user" });
  expect(out).toEqual([]);
  expect(err).toEqual(["Journaling is disabled"]);
  expect(codes).toEqual([1]);
  expect(existsSync(path.join(env.XDG_STATE_HOME, "nones"))).toBe(false);
});

test("registration alone does not read config or open SQLite", () => {
  const directory = root();
  const configPath = syntheticConfig(directory, "{ invalid json");
  const env: Record<string, string> = {
    ...envFor(directory),
    OPENCODE_MCP_CONFIG: configPath,
  };
  const program = new Command();
  registerJournalCommands(program, { env });
  expect(program.commands.some((command) => command.name() === "journal")).toBe(
    true,
  );
  expect(existsSync(path.join(env.XDG_STATE_HOME))).toBe(false);
});
