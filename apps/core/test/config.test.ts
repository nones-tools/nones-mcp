import { describe, expect, test } from "bun:test";
import { stat } from "node:fs/promises";
import path from "node:path";
import { loadConfig, resolveConfigDirectory } from "../src/config";
import { makeSandbox } from "./support";

describe("config directory resolution", () => {
  test("prefers NONES_CONFIG_DIR, then XDG_CONFIG_HOME, then home", () => {
    expect(
      resolveConfigDirectory(
        { NONES_CONFIG_DIR: "/srv/nones", XDG_CONFIG_HOME: "/xdg" },
        "/home/user",
      ),
    ).toBe("/srv/nones");
    expect(resolveConfigDirectory({ XDG_CONFIG_HOME: "/xdg" }, "/home/user")).toBe(
      "/xdg/nones",
    );
    expect(resolveConfigDirectory({}, "/home/user")).toBe("/home/user/.config/nones");
  });

  test("rejects a relative override", () => {
    expect(() => resolveConfigDirectory({ NONES_CONFIG_DIR: "relative/dir" })).toThrow(
      /absolute path/,
    );
  });
});

describe("legacy OpenCode 0.5.0 journal compatibility", () => {
  test("accepts a config.json whose only key is journal", async () => {
    const sandbox = await makeSandbox();
    const database = path.join(sandbox.root, "journal.sqlite");
    await sandbox.write("config.json", {
      $schema: "https://example.invalid/nones-config.schema.json",
      journal: {
        enabled: true,
        capturePrompts: true,
        sqlitePath: database,
        adapter: { module: "sqlite", options: { pageSize: 4096 } },
      },
    });
    const loaded = await loadConfig({ directory: sandbox.configDir, env: {} });
    expect(loaded.shared.modules).toEqual([]);
    expect(loaded.journal).toEqual({
      enabled: true,
      capturePrompts: true,
      sqlitePath: database,
      adapter: { module: "sqlite", options: { pageSize: 4096 } },
      source: "config.json#journal",
    });
    // The prototype must not open or create the journal before extraction.
    await expect(stat(database)).rejects.toThrow();
  });

  test("dedicated journal.json wins and is reported", async () => {
    const sandbox = await makeSandbox();
    await sandbox.write("config.json", {
      $schema: "https://example.invalid/nones-config.schema.json",
      journal: { enabled: true, sqlitePath: "/tmp/legacy.sqlite" },
    });
    await sandbox.write("journal.json", { enabled: false, capturePrompts: false });
    const loaded = await loadConfig({ directory: sandbox.configDir, env: {} });
    expect(loaded.journal.enabled).toBe(false);
    expect(loaded.journal.source).toBe("journal.json");
    expect(loaded.warnings.join(" ")).toContain("journal.json overrides");
  });
});

describe("config separation and unsafe configs", () => {
  test("shared config cannot carry permissions or module env", async () => {
    const sandbox = await makeSandbox();
    await sandbox.write("config.json", {
      version: 1,
      modules: ["kaiten"],
      permissions: { destructive: true },
    });
    await expect(loadConfig({ directory: sandbox.configDir, env: {} })).rejects.toThrow(
      /config.permissions is not a supported key/,
    );
  });

  test("module config rejects literal credentials and reserved variables", async () => {
    const sandbox = await makeSandbox();
    await sandbox.write("config.json", { version: 1, modules: ["kaiten"] });
    await sandbox.write("modules/kaiten.json", {
      version: 1,
      env: { KAITEN_API_TOKEN: "literal-secret-value" },
    });
    await expect(loadConfig({ directory: sandbox.configDir, env: {} })).rejects.toThrow(
      /modules\.kaiten\.env\.KAITEN_API_TOKEN is credential-like/,
    );
    await sandbox.write("modules/kaiten.json", {
      version: 1,
      envFrom: { KAITEN_API_URL: "NODE_OPTIONS" },
    });
    await expect(loadConfig({ directory: sandbox.configDir, env: {} })).rejects.toThrow(
      /executable-loader variable/,
    );
  });

  test("credentials cannot cross module prefixes through envFrom", async () => {
    const sandbox = await makeSandbox();
    await sandbox.write("config.json", { version: 1, modules: ["kaiten", "opencode"] });
    await sandbox.write("modules/kaiten.json", {
      version: 1,
      envFrom: { KAITEN_API_TOKEN: "OPENCODE_MCP_PASSWORD" },
    });
    await sandbox.write("modules/opencode.json", { version: 1 });
    await expect(
      loadConfig({
        directory: sandbox.configDir,
        env: { OPENCODE_MCP_PASSWORD: "opencode-credential" },
      }),
    ).rejects.toThrow(/modules\.kaiten\.envFrom\.KAITEN_API_TOKEN must use the module's own/);
  });

  test("defaults permissions to deny and resolves explicit envFrom", async () => {
    const sandbox = await makeSandbox();
    await sandbox.write("config.json", { version: 1, modules: ["kaiten"] });
    await sandbox.write("modules/kaiten.json", {
      version: 1,
      envFrom: {
        KAITEN_API_URL: "KAITEN_API_URL",
        KAITEN_API_TOKEN: "KAITEN_API_TOKEN",
      },
    });
    const loaded = await loadConfig({
      directory: sandbox.configDir,
      env: {
        KAITEN_API_URL: "https://kaiten.invalid/api/latest",
        KAITEN_API_TOKEN: "token-value-123456789",
      },
    });
    expect(loaded.modules[0]?.config.permissions).toEqual({
      destructive: false,
      admin: false,
      exec: false,
    });
    expect(loaded.modules[0]?.env.KAITEN_API_TOKEN).toBe("token-value-123456789");
    expect(loaded.secrets).toContain("token-value-123456789");
  });

  test("missing parent variable and missing module file fail closed without echoing values", async () => {
    const sandbox = await makeSandbox();
    await sandbox.write("config.json", { version: 1, modules: ["kaiten"] });
    await sandbox.write("modules/kaiten.json", {
      version: 1,
      envFrom: { KAITEN_API_TOKEN: "KAITEN_API_TOKEN" },
    });
    const error = await loadConfig({ directory: sandbox.configDir, env: {} }).catch(
      (cause: unknown) => cause as Error,
    );
    expect(error.message).toContain("KAITEN_API_TOKEN");
    expect(error.message).not.toContain("undefined");

    await sandbox.write("modules/kaiten.json", { version: 1 });
    await sandbox.write("config.json", { version: 1, modules: ["kaiten", "opencode"] });
    const missing = await loadConfig({ directory: sandbox.configDir, env: {} }).catch(
      (cause: unknown) => cause as Error,
    );
    expect(missing.message).toContain("modules/opencode.json is missing");
  });

  test("a disabled module config is skipped with a warning", async () => {
    const sandbox = await makeSandbox();
    await sandbox.write("config.json", { version: 1, modules: ["kaiten"] });
    await sandbox.write("modules/kaiten.json", { version: 1, enabled: false });
    const loaded = await loadConfig({ directory: sandbox.configDir, env: {} });
    expect(loaded.modules).toHaveLength(0);
    expect(loaded.warnings.join(" ")).toContain("disabled");
  });
});
