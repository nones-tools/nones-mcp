import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { repoRoot } from "./support";

const root = path.join(repoRoot, ".tmp", "consumer-pack");
const packs = path.join(root, "pack");
const consumer = path.join(root, "consumer");
const example = path.join(repoRoot, "apps", "core", "test", "consumer", "example.mjs");

function pack(directory: string): string {
  const output = execFileSync(
    "npm",
    ["pack", "--json", "--pack-destination", packs, "--ignore-scripts"],
    { cwd: path.join(repoRoot, directory), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  const report = JSON.parse(output) as Array<{ filename: string }>;
  return path.join(packs, report[0]!.filename);
}

function run(command: string, args: string[]): string {
  return execFileSync(command, args, {
    cwd: consumer,
    encoding: "utf8",
    env: { ...process.env, HOME: consumer },
  });
}

async function mcp(runtime: string, args: string[]) {
  const transport = new StdioClientTransport({
    command: runtime,
    args: [...args, "example.mjs", "--mcp"],
    cwd: consumer,
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: consumer },
    stderr: "pipe",
  });
  transport.stderr?.on("data", () => undefined);
  const client = new Client({ name: "packed-consumer", version: "0.1.0" }, {});
  await client.connect(transport);
  return client;
}

test("packed third-party consumer builds CLI and stdio MCP under Node and Bun", async () => {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(packs, { recursive: true });
  const core = pack("apps/core");
  const journal = pack("adapters/journal");
  mkdirSync(consumer, { recursive: true });
  writeFileSync(
    path.join(consumer, "package.json"),
    `${JSON.stringify(
      {
        name: "packed-consumer",
        private: true,
        type: "module",
        dependencies: {
          "@nones/mcp-core": `file:${core}`,
          "@nones/journal": `file:${journal}`,
        },
        overrides: {
          "@nones/mcp-core": `file:${core}`,
          "@nones/journal": `file:${journal}`,
        },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(path.join(consumer, "example.mjs"), readFileSync(example, "utf8"));
  execFileSync("bun", ["install", "--prefer-offline", "--ignore-scripts"], {
    cwd: consumer,
    stdio: "pipe",
    // Isolated HOME: use a local cache, never the developer's bun cache.
    env: { ...process.env, HOME: consumer },
  });
  const installed = JSON.parse(
    readFileSync(
      path.join(consumer, "node_modules", "@nones", "mcp-core", "package.json"),
      "utf8",
    ),
  ) as { name: string; version: string };
  const coreVersion = (
    JSON.parse(readFileSync(path.join(repoRoot, "apps", "core", "package.json"), "utf8")) as {
      version: string;
    }
  ).version;
  expect(installed).toMatchObject({ name: "@nones/mcp-core", version: coreVersion });

  const runtimes = [
    { name: "node", command: process.env.NODE_BIN ?? "node", args: [] as string[] },
    { name: "bun", command: Bun.which("bun") ?? "bun", args: ["--no-env-file"] },
  ];
  for (const runtime of runtimes) {
    for (const args of [["Ada"], ["--commander", "Ada"]]) {
      expect(run(runtime.command, [...runtime.args, "example.mjs", ...args]).trim()).toBe(
        '{"greeting":"hello Ada"}',
      );
    }
    const client = await mcp(runtime.command, runtime.args);
    try {
      const listed = await client.listTools();
      expect(listed.tools).toEqual([
        {
          name: "example_greet",
          description: "Return a greeting for one name.",
          inputSchema: {
            type: "object",
            properties: { name: { type: "string" } },
            required: ["name"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, openWorldHint: false },
        },
      ]);
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
  }
}, 180_000);
