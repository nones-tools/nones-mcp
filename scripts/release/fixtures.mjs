import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { PACKAGES } from "./constants.mjs";
import { tarballName } from "./semver.mjs";
import { versionCommand } from "./version.mjs";

const run = promisify(execFile);
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const TEST_COMMIT = "0123456789abcdef0123456789abcdef01234567";
export const silent = { info() {}, warn() {} };
export const FILES = [
  "package.json",
  "bun.lock",
  ...PACKAGES.map((entry) => path.join(entry.dir, "package.json")),
];
const COPY_FILES = [
  "package.json",
  "bun.lock",
  "apps/core/package.json",
  "apps/kaiten/package.json",
  "apps/opencode/package.json",
];

function renameDependency(pkg, deprecated, replacement) {
  for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    if (!pkg[field] || typeof pkg[field] !== "object") continue;
    if (!(deprecated in pkg[field])) continue;
    pkg[field][replacement] = pkg[field][deprecated];
    delete pkg[field][deprecated];
  }
}

async function migrateFixture(root) {
  const rootFile = path.join(root, "package.json");
  const rootPackage = JSON.parse(await readFile(rootFile, "utf8"));
  renameDependency(rootPackage, "@nones/mcp-journal-sqlite", "@nones/journal");
  await writeFile(rootFile, `${JSON.stringify(rootPackage, null, 2)}\n`);

  const opencodeFile = path.join(root, "apps/opencode/package.json");
  const opencode = JSON.parse(await readFile(opencodeFile, "utf8"));
  renameDependency(opencode, "@nones/mcp-journal-sqlite", "@nones/journal");
  await writeFile(opencodeFile, `${JSON.stringify(opencode, null, 2)}\n`);

  const journalFile = path.join(root, "adapters/journal/package.json");
  const journal = JSON.parse(await readFile(journalFile, "utf8"));
  journal.name = "@nones/journal";
  journal.description = "Journal collection for the @nones MCP suite (use @nones/journal/sqlite)";
  if (!journal.exports?.["./sqlite"]) {
    journal.exports = {
      ...(journal.exports ?? {}),
      "./sqlite": { types: "./dist/sqlite.d.ts", import: "./dist/sqlite.js" },
    };
  }
  if (journal.repository) journal.repository.directory = "adapters/journal";
  await writeFile(journalFile, `${JSON.stringify(journal, null, 2)}\n`);

  const lockFile = path.join(root, "bun.lock");
  const lock = (await readFile(lockFile, "utf8"))
    .replaceAll("adapters/sqlite", "adapters/journal")
    .replaceAll("@nones/mcp-journal-sqlite", "@nones/journal");
  await writeFile(lockFile, lock);
}

export async function makeFixture(version = "5.0.0") {
  const root = await mkdtemp(path.join(os.tmpdir(), "nones-release-test-"));
  for (const relative of COPY_FILES) {
    const destination = path.join(root, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(REPO_ROOT, relative), destination);
  }
  const journalDestination = path.join(root, "adapters/journal/package.json");
  await mkdir(path.dirname(journalDestination), { recursive: true });
  const newJournal = path.join(REPO_ROOT, "adapters/journal/package.json");
  const legacyJournal = path.join(REPO_ROOT, "adapters/sqlite/package.json");
  await copyFile(existsSync(newJournal) ? newJournal : legacyJournal, journalDestination);
  await migrateFixture(root);
  if (version) await versionCommand({ root, version, write: true, logger: silent });
  return root;
}

export async function readManifests(root) {
  return Promise.all(
    PACKAGES.map(async (entry) => JSON.parse(
      await readFile(path.join(root, entry.dir, "package.json"), "utf8"),
    )),
  );
}

export async function snapshot(root) {
  const values = new Map();
  for (const relative of FILES) values.set(relative, await readFile(path.join(root, relative), "utf8"));
  return values;
}

export async function git(root, args) {
  return run("git", args, { cwd: root });
}

export async function gitFixture() {
  const root = await makeFixture("5.0.0");
  await git(root, ["init", "-q", "-b", "main"]);
  await git(root, ["config", "user.name", "Release Test"]);
  await git(root, ["config", "user.email", "release@example.invalid"]);
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-qm", "fixture"]);
  await git(root, ["tag", "v5.0.0"]);
  await git(root, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  return root;
}

export function hash(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

export async function makeReleaseFiles(root, tag = "v5.0.0") {
  const version = tag.replace(/^v/, "");
  const outDir = path.join(root, ".tmp", "release", tag);
  await mkdir(outDir, { recursive: true });
  const packages = [];
  for (const entry of PACKAGES) {
    const filename = tarballName(entry.name, version);
    const contents = Buffer.from(`tarball:${entry.name}@${version}\n`);
    await writeFile(path.join(outDir, filename), contents);
    packages.push({
      name: entry.name,
      dir: entry.dir,
      version,
      tarball: filename,
      sha256: hash(contents),
      size: contents.length,
    });
  }
  const manifest = { schema: 1, tag, version, packages };
  await writeFile(path.join(outDir, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(
    path.join(outDir, "SHA256SUMS"),
    `${packages.map((entry) => `${entry.sha256}  ${entry.tarball}`).join("\n")}\n`,
  );
  await writeFile(path.join(outDir, "release-commit.txt"), `${TEST_COMMIT}\n`);
  return { outDir, manifest };
}

export async function cleanup(root) {
  await rm(root, { recursive: true, force: true });
}
