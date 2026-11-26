import { afterAll, beforeAll, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dir, "..");
let work: string;
let consumer: string;
let packageDir: string;
let packedFiles: string[];

beforeAll(() => {
  work = mkdtempSync(path.join(tmpdir(), "opencode-mcp-package-"));
  const packDir = path.join(work, "pack");
  mkdirSync(packDir);
  const output = execFileSync(
    "npm",
    ["pack", "--json", "--pack-destination", packDir],
    { cwd: projectRoot, encoding: "utf8" },
  );
  const pack = JSON.parse(output)[0];
  packedFiles = pack.files.map((file: { path: string }) => file.path);
  const nodeTypes = JSON.parse(
    readFileSync(
      path.join(projectRoot, "node_modules", "@types", "node", "package.json"),
      "utf8",
    ),
  ).version;

  consumer = path.join(work, "consumer");
  mkdirSync(consumer);
  writeFileSync(
    path.join(consumer, "package.json"),
    JSON.stringify({ name: "consumer", private: true, type: "module" }),
  );
  execFileSync(
    "npm",
    [
      "install",
      "--no-audit",
      "--no-fund",
      "--ignore-scripts",
      path.join(packDir, pack.filename),
      "typescript@7.0.2",
      `@types/node@${nodeTypes}`,
    ],
    { cwd: consumer, stdio: "pipe" },
  );
  packageDir = path.join(consumer, "node_modules", "@nones", "opencode-mcp");
}, 180_000);

afterAll(() => {
  if (work) rmSync(work, { recursive: true, force: true });
});

test("the published tarball contains the CLI, SDK, and declarations", () => {
  expect(packedFiles).toContain("dist/cli.js");
  expect(packedFiles).toContain("dist/index.js");
  expect(packedFiles).toContain("dist/index.d.ts");
  expect(packedFiles).toContain("dist/types.d.ts");
  expect(packedFiles).not.toContain("src/index.ts");
  expect(packedFiles).not.toContain("scripts/fix-declaration-imports.mjs");
});

test("declarations use resolvable NodeNext relative specifiers", () => {
  const dist = path.join(packageDir, "dist");
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
    path.join(consumer, "tsconfig.json"),
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
    path.join(consumer, "index.ts"),
    `import {
  OpenCodeClient,
  classify,
  createServer,
  groupHistory,
  sanitize,
  type Operation,
  type Request,
} from "@nones/opencode-mcp";

const env: Record<string, string | undefined> = {};
const operation: Operation = {
  id: "server.info",
  method: "GET",
  path: "/api/server/info",
  parameters: [],
};
const request: Request = { operation: operation.id };
const category = classify(operation);
const grouped = groupHistory({ data: [] });
const clean = sanitize({ password: "secret" });
const connect: typeof OpenCodeClient.connect = OpenCodeClient.connect;
const serve: typeof createServer = createServer;
export { category, clean, connect, env, grouped, request, serve };
`,
  );
  execFileSync(
    "node",
    [
      path.join(consumer, "node_modules", "typescript", "bin", "tsc"),
      "-p",
      path.join(consumer, "tsconfig.json"),
    ],
    { cwd: consumer, stdio: "pipe" },
  );
});

test("the installed Node CLI runs from the packed tarball", () => {
  const output = execFileSync(
    "node",
    [path.join(packageDir, "dist", "cli.js"), "help"],
    { encoding: "utf8" },
  );
  expect(output).toContain("Usage: opencode-mcp");
});
