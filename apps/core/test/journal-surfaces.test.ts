import { afterAll, beforeAll, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { readJournalList } from "../src/journal/index";
import { setupE2E, type E2EFixture } from "./fixtures";
import { repoRoot } from "./support";

const kaitenBin = path.join(repoRoot, "apps", "kaiten", "dist", "cli", "index.js");
const opencodeBin = path.join(repoRoot, "apps", "opencode", "dist", "cli.js");

let fixture: E2EFixture;

beforeAll(async () => {
  await Promise.all([access(kaitenBin), access(opencodeBin)]);
  fixture = await setupE2E();
}, 30_000);

afterAll(async () => {
  await fixture?.close();
}, 30_000);

function run(
  args: string[],
  env: Record<string, string>,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("aggregate, standalone MCP and CLI server-start share one user journal", async () => {
  const aggregate = await fixture.connect();
  await aggregate.callTool({ name: "kaiten_health", arguments: {} });
  await aggregate.callTool({ name: "opencode_server_info", arguments: {} });
  await aggregate.close();

  const kaiten = await fixture.listDirect({
    bin: kaitenBin,
    env: { ...fixture.env },
  });
  await kaiten.callTool({ name: "kaiten_health", arguments: {} });
  await kaiten.close();

  const opencode = await fixture.listDirect({
    bin: opencodeBin,
    env: { ...fixture.env, OPENCODE_MCP_URL: fixture.stub.url },
  });
  await opencode.callTool({ name: "opencode_server_info", arguments: {} });
  await opencode.close();

  const started = await run(
    [opencodeBin, "server", "start", "--timeout", "10"],
    { ...fixture.env, OPENCODE_MCP_URL: fixture.stub.url },
  );
  expect(started.code).toBe(0);
  expect(JSON.parse(started.stdout)).toMatchObject({
    status: "ready",
    source: "explicit",
  });

  const page = await readJournalList({
    env: fixture.env,
    includePrompts: true,
    limit: 50,
  });
  const operations = page.records.map((record) => record.operation).sort();
  expect(operations).toEqual([
    "kaiten.mcp.kaiten_health",
    "kaiten.mcp.kaiten_health",
    "opencode.mcp.opencode_server_info",
    "opencode.mcp.opencode_server_info",
    "opencode.service.start",
  ]);
  // The private readiness subprocess must never add a sixth record.
  expect(
    page.records.filter((record) => record.operation === "opencode.mcp.opencode_server_info"),
  ).toHaveLength(2);
  expect(page.records.every((record) => record.prompt === undefined)).toBe(true);
  const allowed = new Set([
    "id",
    "at",
    "operation",
    "outcome",
    "durationMs",
    "sessionId",
    "sessionTitle",
    "messageId",
  ]);
  for (const record of page.records)
    expect(Object.keys(record).every((key) => allowed.has(key))).toBe(true);
}, 40_000);
