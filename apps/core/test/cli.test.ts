import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { childEnvironment, coreBin, makeSandbox, repoRoot } from "./support";

const NODE = process.env.NODE_BIN ?? "node";

function run(
  runtime: string,
  args: string[],
  env: Record<string, string>,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(runtime, args, { cwd: repoRoot, env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

describe("packaged CLI execution", () => {
  test("package bin maps the nones-mcp entry", async () => {
    const pkg = JSON.parse(
      await readFile(path.join(repoRoot, "apps/core/package.json"), "utf8"),
    ) as { bin: Record<string, string>; engines: { node: string } };
    expect(pkg.bin).toEqual({ "nones-mcp": "./dist/bin.js" });
    expect(pkg.engines.node).toBe(">=22.14");
  });

  test("runs under Node >= 22.14 and under Bun", async () => {
    const sandbox = await makeSandbox();
    const env = childEnvironment(sandbox, {});
    await sandbox.write("config.json", { version: 1, modules: [] });
    for (const runtime of [NODE, process.execPath]) {
      const result = await run(runtime, [coreBin, "--version"], env);
      expect(result.code).toBe(0);
      expect(result.stdout.trim()).toBe("0.1.0");
    }
  });

  test("doctor prints one JSON report and no MCP traffic", async () => {
    const sandbox = await makeSandbox();
    await sandbox.write("config.json", { version: 1, modules: [], logLevel: "warn", journal: { enabled: false } });
    const result = await run(NODE, [coreBin, "doctor"], childEnvironment(sandbox, {}));
    expect(result.code).toBe(0);
    const report = JSON.parse(result.stdout) as {
      name: string;
      modules: unknown[];
      journal: { enabled: boolean };
    };
    expect(report.name).toBe("nones-mcp");
    expect(report.modules).toEqual([]);
    expect(report.journal.enabled).toBe(false);
  });

  test("serving keeps stdout empty and shuts down its child on EOF", async () => {
    const sandbox = await makeSandbox();
    await sandbox.write("config.json", {
      version: 1,
      modules: ["kaiten"],
      logLevel: "info",
    });
    await sandbox.write("modules/kaiten.json", {
      version: 1,
      env: { KAITEN_API_URL: "http://127.0.0.1:9/api/latest" },
      envFrom: { KAITEN_API_TOKEN: "KAITEN_API_TOKEN" },
    });
    const env = childEnvironment(sandbox, { KAITEN_API_TOKEN: "test-token-not-real" });
    const exit = await new Promise<{ code: number | null; stdout: string; stderr: string }>(
      (resolve, reject) => {
        const child = spawn(NODE, [coreBin], { cwd: repoRoot, env });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
        child.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString();
          if (stderr.includes("module started")) child.stdin.end();
        });
        child.on("error", reject);
        child.on("close", (code) => resolve({ code, stdout, stderr }));
        setTimeout(() => child.stdin.end(), 4000);
      },
    );
    expect(exit.code).toBe(0);
    expect(exit.stdout).toBe("");
    expect(exit.stderr).toContain("shutting down");
  });
});
