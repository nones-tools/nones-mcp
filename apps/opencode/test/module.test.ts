import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { createLogger, type ModuleContext } from "@nones/mcp-core";
import { module, resolveOpencodeHost, HOST_VERSION } from "../src/index";
import { repoRoot } from "../../core/test/support";
import { startOpencodeStub } from "../../core/test/stub-opencode";

const stateDir = await mkdtemp(path.join(repoRoot, ".tmp", "tests", "opencode-"));
const stub = await startOpencodeStub();

function context(): ModuleContext {
  return {
    id: "opencode",
    version: "0.1.0",
    config: {
      version: 1,
      enabled: true,
      permissions: { destructive: false, admin: false, exec: false },
      env: { OPENCODE_MCP_URL: stub.url },
      envFrom: {},
      options: {},
    },
    env: Object.freeze({ OPENCODE_MCP_URL: stub.url }),
    shared: { logLevel: "warn", moduleId: "opencode" },
    journal: Object.freeze({
      enabled: false,
      capturePrompts: false,
      sqlitePath: null,
      adapter: null,
      source: "default",
    }),
    stateDir,
    logger: createLogger("error"),
    signal: new AbortController().signal,
  };
}

afterAll(async () => {
  await stub.close();
  await rm(stateDir, { recursive: true, force: true });
});

describe("opencode module", () => {
  test("resolves 0.3.0 and its oc2-mcp alias", async () => {
    const host = await resolveOpencodeHost();
    expect(host.version).toBe(HOST_VERSION);
    expect(host.bins["oc2-mcp"]).toBe(host.bins["opencode-mcp"] as string);
  });

  test("forwards SDK v2 discovery, a call and close", async () => {
    const runtime = await module.start(context());
    try {
      const names = runtime.tools.map((tool) => tool.definition.name);
      expect(names).toContain("opencode_operations");
      expect(names).toContain("opencode_server_info");
      const info = runtime.tools.find(
        (tool) => tool.definition.name === "opencode_server_info",
      );
      const result = await info?.call({}, { signal: new AbortController().signal });
      expect(result?.structuredContent).toEqual({
        data: { data: { version: "2.4.1", healthy: true } },
      });
    } finally {
      await runtime.close();
    }
  });
});
