import { afterAll, beforeAll, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { version as packageVersion } from "../src/version";
import { packageFixture, type PackageFixture } from "./package-fixture";
import { startSessionStub } from "./session-stub";

let fixture: PackageFixture;
let mcpStub: ReturnType<typeof startSessionStub>;

beforeAll(async () => {
  fixture = await packageFixture();
  mcpStub = startSessionStub();
}, 180_000);

afterAll(() => mcpStub?.server.stop(true));

test("the published tarball contains the CLI, SDK, and declarations", () => {
  expect(fixture.packedFiles).toContain("dist/cli.js");
  expect(fixture.packedFiles).toContain("dist/index.js");
  expect(fixture.packedFiles).toContain("dist/index.d.ts");
  expect(fixture.packedFiles).toContain("dist/journal/public.js");
  expect(fixture.packedFiles).toContain("dist/journal/public.d.ts");
  expect(fixture.packedFiles).toContain("dist/types.d.ts");
  expect(fixture.packedFiles).not.toContain("src/index.ts");
  expect(fixture.packedFiles).not.toContain(
    "scripts/fix-declaration-imports.mjs",
  );
});

test("declarations use resolvable NodeNext relative specifiers", () => {
  const dist = path.join(fixture.packageDir, "dist");
  let count = 0;
  for (const file of readdirSync(dist).filter((name) =>
    name.endsWith(".d.ts"),
  )) {
    const source = readFileSync(path.join(dist, file), "utf8");
    const specifiers = [
      ...source.matchAll(/(?:from\s*|import\s*\(\s*)["'](\.[^"']+)["']/g),
    ].map((match) => match[1]);
    count += specifiers.length;
    for (const specifier of specifiers) {
      expect(specifier.endsWith(".js")).toBe(true);
    }
  }
  expect(count).toBeGreaterThan(0);
});

test("an external NodeNext TypeScript consumer resolves the SDK", () => {
  writeFileSync(
    path.join(fixture.consumer, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        types: ["node"],
      },
      include: ["index.ts"],
    }),
  );
  writeFileSync(
    path.join(fixture.consumer, "index.ts"),
    `import {
  OpenCodeClient,
  classify,
  createServer,
  groupHistory,
  sanitize,
  type Operation,
  type Request,
} from "@nones/opencode-mcp";
import {
  JOURNAL_API_VERSION,
  type JournalAdapterFactory,
} from "@nones/opencode-mcp/journal";

const env: Record<string, string | undefined> = {};
const operation: Operation = {
  id: "server.info",
  method: "GET",
  path: "/api/server/info",
  parameters: [],
};
const journalVersion: number = JOURNAL_API_VERSION;
const journalFactory: JournalAdapterFactory = {
  apiVersion: 1,
  create: () => ({
    apiVersion: 1,
    record: async (record) => ({ id: record.id, inserted: true }),
    query: async () => ({ records: [], next: null }),
    stats: async () => ({
      total: 0,
      firstAt: null,
      lastAt: null,
      byOutcome: [],
      byOperation: [],
    }),
    close: async () => {},
  }),
};
const request: Request = { operation: operation.id };
const category = classify(operation);
const grouped = groupHistory({ data: [] });
const clean = sanitize({ password: "secret" });
const connect: typeof OpenCodeClient.connect = OpenCodeClient.connect;
const serve: typeof createServer = createServer;
export { category, clean, connect, env, grouped, journalFactory, journalVersion, request, serve };
`,
  );
  execFileSync(
    "node",
    [
      path.join(fixture.consumer, "node_modules", "typescript", "bin", "tsc"),
      "-p",
      path.join(fixture.consumer, "tsconfig.json"),
    ],
    { cwd: fixture.consumer, stdio: "pipe" },
  );
});

test("the installed Node CLI runs from the packed tarball", () => {
  const cli = path.join(fixture.packageDir, "dist", "cli.js");
  const version = execFileSync("node", [cli, "--version"], {
    encoding: "utf8",
  });
  expect(version.trim()).toBe(packageVersion);
  const output = execFileSync("node", [cli, "help"], { encoding: "utf8" });
  expect(output).toContain("Usage: opencode-mcp");
  expect(output).toContain("start");
  expect(output).toContain("doctor");
  expect(output).toContain("journal");
});

test("installed Node journal list and stats use a synthetic config", () => {
  const cli = path.join(fixture.packageDir, "dist", "cli.js");
  const directory = mkdtempSync(path.join(fixture.work, "journal-node-"));
  const config = path.join(directory, "config.json");
  writeFileSync(
    config,
    JSON.stringify({
      journal: { sqlitePath: path.join(directory, "journal.sqlite") },
    }),
  );
  const env = { ...process.env, OPENCODE_MCP_CONFIG: config };
  const list = execFileSync("node", [cli, "journal", "list"], {
    encoding: "utf8",
    env,
  });
  expect(JSON.parse(list)).toEqual({ records: [], next: null });
  const stats = JSON.parse(
    execFileSync("node", [cli, "journal", "stats"], {
      encoding: "utf8",
      env,
    }),
  );
  expect(stats.total).toBe(0);
  expect(stats.byOperation).toEqual([]);
});

test("the oc2-mcp alias points at the same installed CLI", () => {
  const manifest = JSON.parse(
    readFileSync(path.join(fixture.packageDir, "package.json"), "utf8"),
  );
  expect(manifest.bin).toEqual({
    "opencode-mcp": "./dist/cli.js",
    "oc2-mcp": "./dist/cli.js",
  });
  const alias = path.join(fixture.consumer, "node_modules", ".bin", "oc2-mcp");
  expect(existsSync(alias)).toBe(true);
  expect(execFileSync(alias, ["--version"], { encoding: "utf8" }).trim()).toBe(
    packageVersion,
  );
});

test("the installed SDK loads under Node", () => {
  const output = execFileSync(
    "node",
    [
      "--input-type=module",
      "-e",
      "import('@nones/opencode-mcp').then((sdk) => console.log(typeof sdk.createServer))",
    ],
    { cwd: fixture.consumer, encoding: "utf8" },
  );
  expect(output.trim()).toBe("function");
});
