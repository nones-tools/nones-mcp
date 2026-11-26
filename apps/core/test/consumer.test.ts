import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { repoRoot } from "./support";

const example = path.join(repoRoot, "apps", "core", "test", "consumer", "example.mjs");
const runtimes = [
  { name: "node", command: process.env.NODE_BIN ?? "node", args: [] as string[] },
  { name: "bun", command: Bun.which("bun") ?? "bun", args: ["--no-env-file"] },
];

for (const runtime of runtimes) {
  test(`${runtime.name}: consumer builds the CLI from explicit definitions`, () => {
    for (const args of [["Ada"], ["--commander", "Ada"]]) {
      const result = spawnSync(runtime.command, [...runtime.args, example, ...args], {
        encoding: "utf8",
        cwd: repoRoot,
      });
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('{"greeting":"hello Ada"}');
    }
  }, 20_000);

  test(`${runtime.name}: consumer builds stdio MCP with the same definition`, async () => {
    const transport = new StdioClientTransport({
      command: runtime.command,
      args: [...runtime.args, example, "--mcp"],
      cwd: repoRoot,
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: repoRoot },
      stderr: "pipe",
    });
    transport.stderr?.on("data", () => undefined);
    const client = new Client({ name: "consumer-test", version: "0.1.0" }, {});
    await client.connect(transport);
    try {
      const listed = await client.listTools();
      expect(listed.tools).toHaveLength(1);
      expect(listed.tools[0]).toEqual({
        name: "example_greet",
        description: "Return a greeting for one name.",
        inputSchema: {
          type: "object",
          properties: { name: { type: "string" } },
          required: ["name"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      });
      const called = await client.callTool({
        name: "example_greet",
        arguments: { name: "Ada" },
      });
      expect(JSON.parse((called.content[0] as { text: string }).text)).toEqual({
        greeting: "hello Ada",
      });
      const invalid = await client
        .callTool({ name: "example_greet", arguments: {} })
        .catch((error: { code?: number }) => error);
      expect((invalid as { code?: number }).code).toBe(-32602);
    } finally {
      await client.close();
    }
  }, 20_000);
}
