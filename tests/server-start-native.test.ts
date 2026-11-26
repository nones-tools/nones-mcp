import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { waitForExit } from "./stdio";

const cli = path.resolve(import.meta.dir, "..", "dist", "cli.js");
const fixture = path.resolve(
  import.meta.dir,
  "fixtures",
  "synthetic-opencode.ts",
);

function start(
  args: string[],
  env: Environment,
  cwd: string,
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

test("server start launches a synthetic managed service and proves MCP", async () => {
  const work = mkdtempSync(path.join(tmpdir(), "oc2-native-start-"));
  const registration = path.join(work, "opencode", "service.json");
  const bin = path.join(work, "bin", "opencode2");
  try {
    mkdirSync(path.dirname(bin), { recursive: true });
    writeFileSync(
      bin,
      `#!/bin/sh\nexec "${process.execPath}" "${fixture}" "$@"\n`,
      { mode: 0o755 },
    );
    const result = await waitForExit(
      start(
        ["server", "start", "--timeout", "10", "--opencode-bin", bin],
        {
          HOME: work,
          XDG_STATE_HOME: work,
          XDG_RUNTIME_DIR: work,
          SYNTHETIC_SERVICE_FILE: registration,
          PATH: process.env.PATH,
          OPENCODE_MCP_URL: undefined,
          OPENCODE_MCP_SERVICE_FILE: undefined,
          OPENCODE_MCP_OPENCODE_BIN: undefined,
        },
        work,
      ),
    );
    expect(result.code).toBe(0);
    const ready = JSON.parse(result.stdout);
    expect(ready).toMatchObject({
      status: "ready",
      source: "managed",
      nativeStartRequested: true,
      mcpVersion: "0.5.0",
      readiness: "tool",
    });
    expect(result.stderr).toBe("");
  } finally {
    try {
      const info = JSON.parse(readFileSync(registration, "utf8"));
      process.kill(info.pid, "SIGTERM");
    } catch {}
    rmSync(work, { recursive: true, force: true });
  }
}, 20000);
