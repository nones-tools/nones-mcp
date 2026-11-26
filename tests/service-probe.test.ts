import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createMcpProbe, probeArguments } from "../src/service-probe";

const work = mkdtempSync(path.join(tmpdir(), "opencode-mcp-probe-"));
const runtime = process.versions.bun ? "bun" : "node";

afterAll(() => rmSync(work, { recursive: true, force: true }));

function fixture(name: string): string {
  return path.join(import.meta.dir, "fixtures", name);
}

test("Bun probe arguments disable env-file loading before the CLI", () => {
  expect(probeArguments(["/tmp/cli.js"], "bun")).toEqual([
    "--no-env-file",
    "/tmp/cli.js",
    "mcp",
  ]);
  expect(probeArguments(["/tmp/cli.js"], "node")).toEqual([
    "/tmp/cli.js",
    "mcp",
  ]);
});

test("a real subprocess MCP handshake proves readiness", async () => {
  const probe = createMcpProbe({
    command: process.execPath,
    args: [fixture("mcp-stub.ts")],
    runtime,
    env: process.env,
  });
  const result = await probe({ timeoutMs: 8000, env: process.env });
  expect(result.ready).toBe(true);
  if (result.ready) {
    expect(result.mcpVersion).toBe("0.4.0-test");
    expect(result.serverName).toBe("opencode-mcp-stub");
    expect(result.method).toBe("tool");
  }
}, 15000);

test("a timed-out probe closes its child", async () => {
  const pidFile = path.join(work, "probe.pid");
  const probe = createMcpProbe({
    command: process.execPath,
    args: [fixture("silent-stub.ts")],
    runtime,
    env: process.env,
  });
  const started = Date.now();
  const result = await probe({
    timeoutMs: 300,
    env: { ...process.env, STUB_PID_FILE: pidFile },
  });
  expect(result.ready).toBe(false);
  expect(Date.now() - started).toBeLessThan(3000);
  const pid = Number(readFileSync(pidFile, "utf8"));
  expect(pid).toBeGreaterThan(0);
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(() => process.kill(pid, 0)).toThrow();
}, 15000);

test("an isError tools/call is not accepted as readiness", async () => {
  const probe = createMcpProbe({
    command: process.execPath,
    args: [fixture("mcp-stub.ts")],
    runtime,
    env: process.env,
  });
  const result = await probe({
    timeoutMs: 8000,
    env: { ...process.env, STUB_TOOL_ERROR: "1" },
  });
  expect(result.ready).toBe(false);
  if (!result.ready) expect(result.detail).toContain("isError");
}, 15000);

test("a throwing info tools/call is not accepted as readiness", async () => {
  const probe = createMcpProbe({
    command: process.execPath,
    args: [fixture("mcp-stub.ts")],
    runtime,
    env: process.env,
  });
  const result = await probe({
    timeoutMs: 8000,
    env: { ...process.env, STUB_TOOL_ERROR: "throw" },
  });
  expect(result.ready).toBe(false);
  if (!result.ready) expect(result.detail).toContain("call failed");
}, 15000);
