import { afterAll, beforeAll, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { waitForExit } from "./stdio";
import { startStub } from "./stub";

const cli = path.resolve(import.meta.dir, "..", "dist", "cli.js");
const unavailable = "http://127.0.0.1:1";
let stub: ReturnType<typeof startStub>;
let url: string;

beforeAll(() => {
  stub = startStub();
  url = stub.url;
});
afterAll(() => stub.server.stop(true));

function start(
  args: string[],
  env: Environment = {},
  cwd = process.cwd(),
): ReturnType<typeof spawn> {
  const merged = Object.fromEntries(
    Object.entries({ ...process.env, ...env }).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  return spawn(process.execPath, [cli, ...args], {
    cwd,
    env: merged,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

test("server start help documents flags and exit codes", async () => {
  const result = await waitForExit(
    start(["server", "start", "--help"], { OPENCODE_MCP_URL: unavailable }),
  );
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("--timeout <seconds>");
  expect(result.stdout).toContain("--opencode-bin <path>");
  expect(result.stdout).toContain("Never restarts, stops, or replaces");
  expect(result.stdout).toContain("124 timeout");
  expect(result.stderr).toBe("");
}, 15000);

test("server start reuses an explicit endpoint and proves MCP", async () => {
  const result = await waitForExit(
    start(["server", "start", "--timeout", "10"], { OPENCODE_MCP_URL: url }),
  );
  expect(result.code).toBe(0);
  const ready = JSON.parse(result.stdout);
  expect(ready).toMatchObject({
    status: "ready",
    source: "explicit",
    nativeStartRequested: false,
    mcpVersion: "0.4.0",
  });
  expect(["tool", "list"]).toContain(ready.readiness);
  expect(result.stderr).toBe("");
}, 20000);

test("server start explicit timeout exits 124", async () => {
  const result = await waitForExit(
    start(["server", "start", "--timeout", "0.3"], {
      OPENCODE_MCP_URL: unavailable,
    }),
  );
  expect(result.code).toBe(124);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("readiness timed out");
}, 15000);

test("server start SIGINT exits 130 without stopping a service", async () => {
  const child = start(["server", "start", "--timeout", "10"], {
    OPENCODE_MCP_URL: unavailable,
  });
  const exit = waitForExit(child);
  setTimeout(() => child.kill("SIGINT"), 300);
  const result = await exit;
  expect(result.code).toBe(130);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("canceled");
}, 15000);

test("server start reports a missing managed binary without starting", async () => {
  const work = mkdtempSync(path.join(tmpdir(), "oc2-server-start-"));
  try {
    const result = await waitForExit(
      start(
        ["server", "start", "--timeout", "5"],
        {
          HOME: work,
          XDG_STATE_HOME: work,
          XDG_RUNTIME_DIR: work,
          PATH: path.join(work, "bin"),
          OPENCODE_MCP_URL: undefined,
          OPENCODE_MCP_SERVICE_FILE: undefined,
          OPENCODE_MCP_OPENCODE_BIN: undefined,
        },
        work,
      ),
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("OpenCode executable not found");
    expect(result.stderr).toContain("--opencode-bin");
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}, 15000);
