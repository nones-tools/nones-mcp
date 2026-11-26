import { access } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport, type StdioServerParameters } from "@modelcontextprotocol/client/stdio";
import type { ClientCapabilities } from "@modelcontextprotocol/server";
import { childEnvironment, coreBin, makeSandbox, repoRoot, type Sandbox } from "./support";
import { startOpencodeStub, type OpencodeStub } from "./stub-opencode";

export const KAITEN_TOKEN = "test-token-not-real-0001";
export const KAITEN_URL = "http://127.0.0.1:9/api/latest";
const NODE = process.env.NODE_BIN ?? "node";

export interface E2EFixture {
  sandbox: Sandbox;
  stub: OpencodeStub;
  env: Record<string, string>;
  connect(capabilities?: ClientCapabilities): Promise<Client>;
  listDirect(params: { bin: string; env: Record<string, string> }): Promise<Client>;
  close(): Promise<void>;
}

/** Builds the two-module config and one MCP client per core process. */
export async function setupE2E(slowMs = 0): Promise<E2EFixture> {
  await access(coreBin).catch(() => {
    throw new Error(`missing ${coreBin}; run bun run build first`);
  });
  const sandbox = await makeSandbox();
  const stub = await startOpencodeStub({ slowMs });
  const env = childEnvironment(sandbox, {
    KAITEN_API_URL: KAITEN_URL,
    KAITEN_API_TOKEN: KAITEN_TOKEN,
  });
  await sandbox.write("config.json", {
    version: 1,
    modules: ["kaiten", "opencode"],
    logLevel: "warn",
  });
  await sandbox.write("modules/kaiten.json", {
    version: 1,
    envFrom: {
      KAITEN_API_URL: "KAITEN_API_URL",
      KAITEN_API_TOKEN: "KAITEN_API_TOKEN",
    },
  });
  await sandbox.write("modules/opencode.json", {
    version: 1,
    env: { OPENCODE_MCP_URL: stub.url },
  });

  const clients: Client[] = [];
  const open = async (params: StdioServerParameters, capabilities?: ClientCapabilities) => {
    const transport = new StdioClientTransport({
      ...params,
      env: params.env as Record<string, string>,
      stderr: "pipe",
    });
    if (process.env.NONES_E2E_DEBUG) transport.stderr?.pipe(process.stderr);
    else transport.stderr?.on("data", () => undefined);
    const client = new Client(
      { name: "nones-e2e", version: "0.1.0" },
      capabilities ? { capabilities } : {},
    );
    await client.connect(transport);
    clients.push(client);
    return client;
  };

  return {
    sandbox,
    stub,
    env,
    connect: (capabilities) =>
      open(
        { command: NODE, args: [coreBin], cwd: repoRoot, env },
        capabilities,
      ),
    listDirect: (params) =>
      open({
        command: params.bin,
        args: ["mcp"],
        env: params.env,
        cwd: repoRoot,
      }),
    async close() {
      for (const client of clients.reverse()) await client.close().catch(() => undefined);
      await stub.close();
    },
  };
}

export function directEnv(fixture: E2EFixture, extra: Record<string, string> = {}) {
  return {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: fixture.sandbox.home,
    TMPDIR: fixture.sandbox.root,
    LANG: "C",
    ...extra,
  };
}

export function sortedNames(client: Client): Promise<string[]> {
  return client.listTools().then((result) => result.tools.map((tool) => tool.name).sort());
}

export function normalize(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}
