import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Client } from "@modelcontextprotocol/client";
import {
  KAITEN_TOKEN,
  KAITEN_URL,
  directEnv,
  normalize,
  setupE2E,
  type E2EFixture,
} from "./fixtures";
import { repoRoot } from "./support";

let fixture: E2EFixture;
let client: Client;

beforeAll(async () => {
  fixture = await setupE2E();
  client = await fixture.connect();
}, 30_000);

afterAll(async () => {
  await fixture.close();
});

describe("combined server discovery", () => {
  test("exposes one stdio entry with both modules and no duplicate tools", async () => {
    const result = await client.listTools();
    const names = result.tools.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("kaiten_health");
    expect(names).toContain("opencode_operations");
    expect(names).toContain("opencode_server_info");
    expect(names.filter((name) => name.startsWith("kaiten_")).length).toBeGreaterThan(40);
  });

  test("kaiten tools keep optional taskSupport and annotations", async () => {
    const result = await client.listTools();
    const kaiten = result.tools.filter((tool) => tool.name.startsWith("kaiten_"));
    expect(kaiten.length).toBeGreaterThan(0);
    for (const tool of kaiten) {
      expect(tool.execution).toEqual({ taskSupport: "optional" });
      expect(tool.inputSchema).toBeDefined();
    }
    const health = kaiten.find((tool) => tool.name === "kaiten_health");
    expect(health?.annotations).toEqual({ readOnlyHint: true });
  });

  test("advertises tools only; no tasks capability is negotiated", async () => {
    const capabilities = client.getServerCapabilities();
    expect(capabilities?.tools).toBeDefined();
    expect(capabilities?.tasks).toBeUndefined();
  });

  test("schema snapshot digests stay stable", async () => {
    const tools = (await client.listTools()).tools;
    const digest = (prefix: string) =>
      createHash("sha256")
        .update(JSON.stringify(tools.filter((tool) => tool.name.startsWith(prefix))))
        .digest("hex");
    expect(digest("kaiten_")).toBe("84c87eaec90a88c805344128e5c61e587a7dec5e1ec60bf33f71837e57c95753");
    expect(digest("opencode_")).toBe("a2ef594ec88357ec18aa2a5991bb818e49ecc6fd0c786fd135c0d438f4622ae7");
  });

  test("task-capable clients get identical kaiten discovery metadata", async () => {
    const taskClient = await fixture.connect({ tasks: {} });
    const tools = await taskClient.listTools();
    for (const tool of tools.tools.filter((tool) => tool.name.startsWith("kaiten_"))) {
      expect(tool.execution).toEqual({ taskSupport: "optional" });
    }
    const ordinary = await client.listTools();
    expect(normalize(tools.tools.map((tool) => tool.name))).toEqual(
      normalize(ordinary.tools.map((tool) => tool.name)),
    );
  });

  test("kaiten metadata matches the standalone source server exactly", async () => {
    const direct = await fixture.listDirect({
      bin: path.join(repoRoot, "apps/kaiten/dist/cli/index.js"),
      env: directEnv(fixture, {
        KAITEN_API_URL: KAITEN_URL,
        KAITEN_API_TOKEN: KAITEN_TOKEN,
        KAITEN_API_DELETE_ALLOW: "false",
      }),
    });
    const directTools = (await direct.listTools()).tools;
    const forwarded = new Map(
      (await client.listTools()).tools.map((tool) => [tool.name, normalize(tool)]),
    );
    expect(directTools.length).toBeGreaterThan(40);
    for (const tool of directTools) {
      expect(forwarded.get(tool.name)).toEqual(normalize(tool));
    }
  });

  test("opencode metadata matches the standalone source server and its alias bin", async () => {
    const pkg = JSON.parse(
      await readFile(path.join(repoRoot, "apps/opencode/package.json"), "utf8"),
    ) as { bin: Record<string, string> };
    expect(pkg.bin["oc2-mcp"]).toBe(pkg.bin["opencode-mcp"] as string);

    const direct = await fixture.listDirect({
      bin: path.join(repoRoot, "apps/opencode/dist/cli.js"),
      env: directEnv(fixture, { OPENCODE_MCP_URL: fixture.stub.url }),
    });
    const directTools = (await direct.listTools()).tools;
    const forwarded = new Map(
      (await client.listTools()).tools.map((tool) => [tool.name, normalize(tool)]),
    );
    const opencode = directTools.filter((tool) => tool.name.startsWith("opencode_"));
    expect(opencode.length).toBeGreaterThanOrEqual(5);
    for (const tool of opencode) {
      expect(forwarded.get(tool.name)).toEqual(normalize(tool));
    }
  });
});
