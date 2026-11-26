import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import {
  createLogger,
  type ModuleContext,
  type ModulePermissions,
} from "@nones/mcp-core";
import { module, HOST_VERSION } from "../src/index";
import { resolveHost } from "../src/host";
import { repoRoot } from "../../core/test/support";

const stateDir = await mkdtemp(path.join(repoRoot, ".tmp", "tests", "kaiten-"));

function context(permissions: Partial<ModulePermissions> = {}): ModuleContext {
  return {
    id: "kaiten",
    version: "0.1.0",
    config: {
      version: 1,
      enabled: true,
      permissions: { destructive: false, admin: false, exec: false, ...permissions },
      env: {},
      envFrom: {},
      options: {},
    },
    env: Object.freeze({}),
    shared: { logLevel: "warn", moduleId: "kaiten" },
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
  await rm(stateDir, { recursive: true, force: true });
});

describe("kaiten module", () => {
  test("resolves the installed 4.3.0 host without PATH assumptions", async () => {
    const host = await resolveHost("@nones/kaiten-mcp", ["kaiten"]);
    expect(host.version).toBe(HOST_VERSION);
    expect(host.bins.kaiten).toContain("dist/cli/index.js");
  });

  test("rejects unsupported permissions before spawning", async () => {
    await expect(module.start(context({ admin: true }))).rejects.toThrow(
      /does not support permission admin/,
    );
  });

  test("lists the SDK v1 tools with optional taskSupport and closes", async () => {
    // Isolate HOME so an ambient ~/.kaiten/config cannot change discovery.
    const previous = { home: process.env.HOME, xdg: process.env.XDG_CONFIG_HOME };
    process.env.HOME = stateDir;
    process.env.XDG_CONFIG_HOME = path.join(stateDir, "xdg");
    const runtime = await module.start(context());
    try {
      expect(runtime.tools.length).toBeGreaterThan(40);
      for (const tool of runtime.tools) {
        expect(tool.definition.execution).toEqual({ taskSupport: "optional" });
      }
    } finally {
      await runtime.close();
      process.env.HOME = previous.home;
      if (previous.xdg === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = previous.xdg;
    }
  });
});
