import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Client } from "@modelcontextprotocol/client";
import { resolveHost } from "../../kaiten/src/host";
import { resolveOpencodeHost } from "../../opencode/src/index";
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
});

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

  test("kaiten metadata matches the installed SDK v1 server byte-for-byte", async () => {
    const host = await resolveHost("@nones/kaiten-mcp", ["kaiten"]);
    const direct = await fixture.listDirect({
      bin: host.bins.kaiten as string,
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

  test("opencode metadata matches the installed SDK v2 server and its alias bin", async () => {
    const host = await resolveOpencodeHost();
    expect(host.bins["oc2-mcp"]).toBe(host.bins["opencode-mcp"] as string);
    const pkg = JSON.parse(
      await readFile(
        path.join(repoRoot, "apps/opencode/node_modules/@nones/opencode-mcp/package.json"),
        "utf8",
      ),
    ) as { bin: Record<string, string> };
    expect(pkg.bin["oc2-mcp"]).toBe(pkg.bin["opencode-mcp"] as string);

    const direct = await fixture.listDirect({
      bin: host.bins["opencode-mcp"] as string,
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
