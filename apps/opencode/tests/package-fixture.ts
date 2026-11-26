import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const projectRoot = path.resolve(import.meta.dir, "..");

export interface PackageFixture {
  work: string;
  consumer: string;
  packageDir: string;
  packedFiles: string[];
}

let pending: Promise<PackageFixture> | undefined;

/** Pack and install once per test process; reused by Node and Bun checks. */
export function packageFixture(): Promise<PackageFixture> {
  pending ??= prepare();
  return pending;
}

async function prepare(): Promise<PackageFixture> {
  const work = mkdtempSync(path.join(tmpdir(), "opencode-mcp-package-"));
  process.on("exit", () => rmSync(work, { recursive: true, force: true }));
  const packDir = path.join(work, "pack");
  mkdirSync(packDir);
  const output = execFileSync(
    "npm",
    ["pack", "--json", "--pack-destination", packDir],
    { cwd: projectRoot, encoding: "utf8" },
  );
  const pack = JSON.parse(output)[0];
  const packedFiles: string[] = pack.files.map(
    (file: { path: string }) => file.path,
  );
  const nodeTypes = JSON.parse(
    readFileSync(
      path.join(projectRoot, "node_modules", "@types", "node", "package.json"),
      "utf8",
    ),
  ).version;
  const consumer = path.join(work, "consumer");
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
  return {
    work,
    consumer,
    packageDir: path.join(consumer, "node_modules", "@nones", "opencode-mcp"),
    packedFiles,
  };
}
