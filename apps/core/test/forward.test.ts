import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { StdioForwarder } from "../src/index";
import { repoRoot } from "./support";

const NODE = process.env.NODE_BIN ?? "node";
const fixture = path.join(repoRoot, "apps/core/test/fixture-server.mjs");

async function waitUntilGone(pid: number, deadlineMs = 3000): Promise<boolean> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return false;
}

test("forwarder preserves metadata and terminates its owned child on close", async () => {
  const directory = await mkdtemp(path.join(repoRoot, ".tmp", "tests", "forward-"));
  const pidFile = path.join(directory, "child.pid");
  const forwarder = new StdioForwarder({
    moduleId: "fixture",
    command: NODE,
    args: [fixture],
    cwd: directory,
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin", PID_FILE: pidFile },
  });
  try {
    const tools = await forwarder.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(["fixture_echo"]);
    expect(tools[0]?.annotations).toEqual({ readOnlyHint: true });
    const result = await forwarder.callTool(
      "fixture_echo",
      {},
      new AbortController().signal,
    );
    expect(result.isError).toBe(false);
    expect(result.content).toEqual([{ type: "text", text: "fixture-ok" }]);

    const pid = Number(await readFile(pidFile, "utf8"));
    expect(pid).toBeGreaterThan(0);
    await forwarder.close();
    expect(await waitUntilGone(pid)).toBe(true);
  } finally {
    await forwarder.close();
    await rm(directory, { recursive: true, force: true });
  }
});
