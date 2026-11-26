import { afterAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import type { ModuleContext } from "@nones/mcp-core";
import { module } from "../src/module";
import { version as packageVersion } from "../src/version";
import { startSessionStub } from "./session-stub";

const scratch = path.join(process.cwd(), "..", "..", ".tmp", "tests");
await mkdir(scratch, { recursive: true });
const stateDir = await mkdtemp(path.join(scratch, "opencode-module-"));
const stub = startSessionStub();

afterAll(async () => {
  stub.server.stop(true);
  await rm(stateDir, { recursive: true, force: true });
});

function context(): ModuleContext {
  return {
    id: "opencode",
    version: "0.5.0",
    config: {
      version: 1,
      enabled: true,
      permissions: { destructive: false, admin: false, exec: false },
      env: { OPENCODE_MCP_URL: stub.url },
      envFrom: {},
      options: {},
    },
    env: Object.freeze({ OPENCODE_MCP_URL: stub.url }),
    shared: { logLevel: "error", moduleId: "opencode" },
    journal: Object.freeze({ enabled: false, capturePrompts: false, configDirectory: stateDir, configPath: null, sqlitePath: null, adapter: null }),
    stateDir,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    signal: new AbortController().signal,
  };
}

describe("source-owned opencode module", () => {
  test("exposes versioned metadata without reading the service at import time", () => {
    expect(module.apiVersion).toBe(1);
    expect(module.id).toBe("opencode");
    expect(module.version).toBe(packageVersion);
    expect(module.host).toEqual({ name: "@nones/opencode-mcp", version: packageVersion });
  });

  test("discovers native tools with the scoped env and never mutates process.env", async () => {
    const before = JSON.stringify(process.env);
    process.env.OPENCODE_MCP_ALLOW_DESTRUCTIVE = "1";
    const runtime = await module.start(context());
    try {
      const names = runtime.tools.map((tool) => tool.definition.name);
      expect(names).toContain("opencode_operations");
      expect(names).toContain("opencode_server_info");
      expect(names.some((name) => name.startsWith("opencode_session_"))).toBe(true);
      const info = runtime.tools.find((tool) => tool.definition.name === "opencode_server_info");
      const result = await info?.call({}, { signal: new AbortController().signal });
      expect(result?.isError).toBeFalsy();
      expect(result?.structuredContent).toEqual({ data: { data: { version: "2.4.1" } } });
    } finally {
      await runtime.close();
      delete process.env.OPENCODE_MCP_ALLOW_DESTRUCTIVE;
      expect(JSON.parse(before).OPENCODE_MCP_ALLOW_DESTRUCTIVE).toBe(undefined);
    }
  });

  test("rejects module options and closes cleanly", async () => {
    const withOptions = context();
    withOptions.config.options = { unexpected: true };
    await expect(module.start(withOptions)).rejects.toThrow(/does not accept options/);
  });
});
