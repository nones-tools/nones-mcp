import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "./support";

const root = path.join(repoRoot, ".tmp", "pack-consumers");
const packs = path.join(root, "pack");
const packages = {
  core: { dir: path.join(repoRoot, "apps", "core"), name: "@nones/mcp-core" },
  journal: { dir: path.join(repoRoot, "adapters", "journal"), name: "@nones/journal" },
  kaiten: { dir: path.join(repoRoot, "apps", "kaiten"), name: "@nones/kaiten-mcp" },
  opencode: { dir: path.join(repoRoot, "apps", "opencode"), name: "@nones/opencode-mcp" },
};

function pack(key: keyof typeof packages): { file: string; dependencies: string[] } {
  const target = packages[key];
  const output = execFileSync(
    "npm",
    ["pack", "--json", "--pack-destination", packs, "--ignore-scripts"],
    { cwd: target.dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  const report = JSON.parse(output) as Array<{ filename: string }>;
  const manifest = JSON.parse(
    readFileSync(path.join(target.dir, "package.json"), "utf8"),
  ) as { dependencies?: Record<string, string> };
  return {
    file: path.join(packs, report[0]!.filename),
    dependencies: Object.keys(manifest.dependencies ?? {}),
  };
}

function consumer(
  name: string,
  installed: Array<{ key: keyof typeof packages; file: string }>,
  script: string,
): string {
  const directory = path.join(root, name);
  mkdirSync(directory, { recursive: true });
  const dependencies: Record<string, string> = {};
  const overrides: Record<string, string> = {};
  for (const entry of installed) {
    dependencies[packages[entry.key].name] = `file:${entry.file}`;
    overrides[packages[entry.key].name] = `file:${entry.file}`;
  }
  writeFileSync(
    path.join(directory, "package.json"),
    `${JSON.stringify({ name, private: true, type: "module", dependencies, overrides }, null, 2)}\n`,
  );
  writeFileSync(path.join(directory, "verify.mjs"), script);
  execFileSync("bun", ["install", "--prefer-offline", "--ignore-scripts"], {
    cwd: directory,
    stdio: "pipe",
    // Isolated HOME: use a local cache, never the developer's bun cache.
    env: { ...process.env, HOME: directory },
  });
  return directory;
}

function runBoth(directory: string, runtime: "node" | "bun"): unknown {
  const command = runtime === "node" ? (process.env.NODE_BIN ?? "node") : "bun";
  const args = runtime === "node" ? [] : ["--no-env-file"];
  const output = execFileSync(command, [...args, "verify.mjs"], {
    cwd: directory,
    encoding: "utf8",
  });
  return JSON.parse(output.trim().split("\n").at(-1) ?? "{}");
}

const journalScript = (standalone?: "kaiten" | "opencode") => `
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { openJournal, readJournalList } from "@nones/mcp-core/journal";
import sqlite from "@nones/journal/sqlite";
${standalone === "kaiten" ? 'import * as standalone from "@nones/kaiten-mcp";' : ""}
${standalone === "opencode" ? 'import * as publicJournal from "@nones/opencode-mcp/journal";' : ""}

const configDir = new URL("./config", import.meta.url).pathname;
mkdirSync(configDir, { recursive: true });
const database = new URL("./journal.sqlite", import.meta.url).pathname;
writeFileSync(configDir + "/config.json", JSON.stringify({ journal: { enabled: true, sqlitePath: database } }));
const env = { ...process.env, NONES_CONFIG_DIR: configDir };
const journal = await openJournal({ env });
await journal.record({ id: "consumer-1", at: new Date().toISOString(), operation: "example.cli.run", outcome: "success", durationMs: 1 });
await journal.close();
const page = await readJournalList({ env });
const dependencies = ${standalone ? `Object.keys(JSON.parse(readFileSync(new URL("./node_modules/@nones/${standalone === "kaiten" ? "kaiten-mcp" : "opencode-mcp"}/package.json", import.meta.url), "utf8")).dependencies).sort()` : "[]"};
console.log(JSON.stringify({
  runtime: process.versions.bun ? "bun" : "node",
  adapter: sqlite.apiVersion,
  records: page.records.length,
  dependencies,
  ${standalone === "kaiten" ? 'sdk: typeof standalone.createSDK,' : ""}
  ${standalone === "opencode" ? 'journalExport: typeof publicJournal.JOURNAL_API_VERSION, journalCommand: typeof publicJournal.registerJournalCommands, journalRun: typeof publicJournal.runJournaledOperation,' : ""}
}));
`;

test("packed consumers install and run under Node and Bun", () => {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(packs, { recursive: true });
  const core = pack("core");
  const journal = pack("journal");
  const kaiten = pack("kaiten");
  const opencode = pack("opencode");
  expect(core.dependencies).toEqual(expect.arrayContaining(["@modelcontextprotocol/server"]));
  expect(journal.dependencies ?? []).toEqual([]);
  expect(kaiten.dependencies).toEqual(
    expect.arrayContaining(["@nones/journal", "@nones/mcp-core"]),
  );
  expect(opencode.dependencies).toEqual(
    expect.arrayContaining(["@nones/journal", "@nones/mcp-core"]),
  );

  const scenarios = [
    {
      name: "kaiten",
      install: [["kaiten", kaiten], ["core", core], ["journal", journal]] as const,
      script: journalScript("kaiten"),
    },
    {
      name: "opencode",
      install: [["opencode", opencode], ["core", core], ["journal", journal]] as const,
      script: journalScript("opencode"),
    },
    {
      name: "core",
      install: [["core", core], ["journal", journal]] as const,
      script: journalScript(),
    },
  ];

  for (const scenario of scenarios) {
    const directory = consumer(
      scenario.name,
      scenario.install.map(([key, entry]) => ({ key, file: entry.file })),
      scenario.script,
    );
    for (const runtime of ["node", "bun"] as const) {
      const result = runBoth(directory, runtime) as Record<string, unknown>;
      expect(result["runtime"]).toBe(runtime);
      expect(result["adapter"]).toBe(1);
      expect(result["records"]).toBe(1);
      if (scenario.name === "kaiten") {
        expect(result["sdk"]).toBe("function");
        expect(result["dependencies"]).toEqual(
          expect.arrayContaining(["@nones/journal", "@nones/mcp-core"]),
        );
      }
      if (scenario.name === "opencode") {
        expect(result["journalExport"]).toBe("number");
        expect(result["journalCommand"]).toBe("function");
        expect(result["journalRun"]).toBe("function");
      }
    }
  }
}, 180_000);
