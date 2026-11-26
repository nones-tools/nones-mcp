import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readJournalList } from "@nones/mcp-core";

const CLI_PATH = path.join(import.meta.dir, "..", "src", "cli", "index.ts");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function sandbox(): {
  root: string;
  configDir: string;
  journalPath: string;
  env: Record<string, string>;
} {
  const root = mkdtempSync(path.join(tmpdir(), "kaiten-cli-journal-"));
  roots.push(root);
  const configDir = path.join(root, "config", "nones");
  const journalPath = path.join(root, "journal.sqlite");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    path.join(configDir, "config.json"),
    JSON.stringify({ journal: { enabled: true, sqlitePath: journalPath } }),
  );
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env))
    if (value !== undefined && !key.startsWith("KAITEN_")) env[key] = value;
  env.HOME = root;
  env.XDG_STATE_HOME = path.join(root, "state");
  env.NONES_CONFIG_DIR = configDir;
  return { root, configDir, journalPath, env };
}

describe("Kaiten CLI usage failures and the shared journal", () => {
  it("records a recognized usage failure through the returned exit code", async () => {
    const fixture = sandbox();
    const result = Bun.spawnSync(["bun", CLI_PATH, "card"], {
      cwd: fixture.root,
      env: fixture.env,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("Error: Card ID required");

    const page = await readJournalList({ env: fixture.env, includePrompts: true });
    expect(page.records).toHaveLength(1);
    expect(page.records[0]).toMatchObject({
      operation: "kaiten.cli.card",
      outcome: "failure",
    });
    expect(page.records[0].prompt).toBeUndefined();
    expect("argv" in page.records[0]).toBe(false);
    expect("stdout" in page.records[0]).toBe(false);
  }, 20_000);
});
