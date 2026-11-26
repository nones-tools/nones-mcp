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
import { startCli, waitForExit } from "./stdio";
import { startSessionStub } from "./session-stub";

const roots: string[] = [];

function root(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "journal-safety-"));
  roots.push(directory);
  return directory;
}

function writeConfig(directory: string, contents: unknown): string {
  const config = path.join(directory, "config.json");
  writeFileSync(config, JSON.stringify(contents));
  return config;
}

function envFor(directory: string, config: string): Record<string, string> {
  return {
    HOME: directory,
    XDG_STATE_HOME: path.join(directory, "state"),
    OPENCODE_MCP_CONFIG: config,
    OPENCODE_MCP_MODEL: "",
    OC2_MODEL: "",
  };
}

afterEach(() => {
  for (const directory of roots.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

test("custom adapter read errors are replaced with a generic summary", async () => {
  const directory = root();
  const modulePath = path.join(directory, "leak.mjs");
  writeFileSync(
    modulePath,
    `export default {
      apiVersion: 1,
      create: (options) => ({
        apiVersion: 1,
        async record() {},
        async query() { throw new Error("mongo password " + options.secret + " prompt body"); },
        async stats() { throw new Error("http auth " + options.secret); },
        async close() {},
      }),
    };`,
  );
  const config = writeConfig(directory, {
    monorepo: { shared: true },
    journal: {
      adapter: { module: "./leak.mjs", options: { secret: "sk-test-secret" } },
    },
  });
  const env = envFor(directory, config);
  const list = await waitForExit(startCli(["journal", "list"], env), 10_000);
  expect(list.code).toBe(1);
  expect(list.stderr).toContain("Journal adapter failed");
  expect(list.stderr).not.toContain("sk-test-secret");
  expect(list.stderr).not.toContain("prompt body");
  const stats = await waitForExit(startCli(["journal", "stats"], env), 10_000);
  expect(stats.code).toBe(1);
  expect(stats.stderr).toContain("Journal adapter failed");
  expect(stats.stderr).not.toContain("sk-test-secret");
});

test("adapter load failures stay non-fatal for native CLI actions", async () => {
  const directory = root();
  const inside = path.join(directory, "inside");
  mkdirSync(inside);
  const promptPath = path.join(directory, "prompt.txt");
  writeFileSync(promptPath, "Synthetic harmless prompt.\n");
  writeFileSync(
    path.join(directory, "broken.mjs"),
    'throw new Error("sk-test-secret from adapter import");',
  );
  const config = writeConfig(directory, {
    journal: { adapter: { module: "./broken.mjs" } },
  });
  const stub = startSessionStub();
  try {
    const env = {
      ...envFor(directory, config),
      OPENCODE_MCP_URL: stub.url,
    };
    const result = await waitForExit(
      startCli(
        [
          "start",
          "-C",
          inside,
          "-f",
          promptPath,
          "--model",
          "opencode-go/test-model#high",
        ],
        env,
      ),
      10_000,
    );
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).sessionID).toBe("ses_test_1");
    expect(result.stderr).toBe("");
    const journal = await waitForExit(
      startCli(["journal", "list"], env),
      10_000,
    );
    expect(journal.code).toBe(1);
    expect(journal.stderr).toContain("Journal adapter failed");
    expect(journal.stderr).not.toContain("sk-test-secret");
    expect(existsSync(path.join(directory, "state"))).toBe(false);
  } finally {
    stub.server.stop(true);
  }
}, 20_000);
