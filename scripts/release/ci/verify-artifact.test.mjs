import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const verifier = path.join(here, "verify-artifact.mjs");
const names = [
  "@nones/mcp-core",
  "@nones/journal",
  "@nones/kaiten-mcp",
  "@nones/opencode-mcp",
  "@nones/dsh-session-mcp",
];

async function git(cwd, args) {
  return run("git", args, { cwd });
}

async function makeRepo(version) {
  const root = await mkdtemp(path.join(os.tmpdir(), "nones-verify-artifact-"));
  await git(root, ["init", "-q", "-b", "main"]);
  await git(root, ["config", "user.name", "Artifact Test"]);
  await git(root, ["config", "user.email", "artifact@example.invalid"]);
  await writeFile(path.join(root, "file.txt"), "fixture\n");
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-qm", "fixture"]);
  const commit = (await git(root, ["rev-parse", "HEAD"])).stdout.trim();
  await git(root, ["tag", `v${version}`]);
  return { root, commit };
}

function tarballName(name, version) {
  return `${name.slice(1).replace("/", "-")}-${version}.tgz`;
}

async function makeArtifact(root, version, count, { omit = null, extraTarball = false, extraFile = false } = {}) {
  const directory = await mkdtemp(path.join(root, "artifact-"));
  const packages = [];
  for (const name of names.slice(0, count)) {
    const tarball = tarballName(name, version);
    if (tarball === omit) continue;
    const contents = Buffer.from(`tarball:${name}@${version}\n`);
    await writeFile(path.join(directory, tarball), contents);
    packages.push({
      name,
      dir: "apps/test",
      version,
      tarball,
      sha256: createHash("sha256").update(contents).digest("hex"),
      size: contents.length,
    });
  }
  if (extraTarball) {
    await writeFile(path.join(directory, `extra-${version}.tgz`), "extra\n");
  }
  if (extraFile) await writeFile(path.join(directory, "unexpected.txt"), "extra\n");
  const manifest = { schema: 1, tag: `v${version}`, version, packages };
  await writeFile(path.join(directory, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(
    path.join(directory, "SHA256SUMS"),
    `${packages.map((entry) => `${entry.sha256}  ${entry.tarball}`).join("\n")}\n`,
  );
  return { directory, packages };
}

async function verify(root, commit, version, directory) {
  return run(process.execPath, [verifier, directory, `v${version}`, commit], { cwd: root });
}

test("verifies the manifest's actual four or five tarball set", async (t) => {
  for (const [version, count] of [["5.0.0", 4], ["5.1.0", 5]]) {
    const { root, commit } = await makeRepo(version);
    t.after(() => rm(root, { recursive: true, force: true }));
    const { directory } = await makeArtifact(root, version, count);
    await writeFile(path.join(directory, "release-commit.txt"), `${commit}\n`);
    const result = await verify(root, commit, version, directory);
    assert.match(result.stdout, new RegExp(`\\(${count} tarballs\\)`));
  }
});

test("rejects extra tarballs, extra files and incomplete sets", async (t) => {
  const { root, commit } = await makeRepo("5.1.0");
  t.after(() => rm(root, { recursive: true, force: true }));
  const extraTarball = await makeArtifact(root, "5.1.0", 5, { extraTarball: true });
  await writeFile(path.join(extraTarball.directory, "release-commit.txt"), `${commit}\n`);
  await assert.rejects(
    verify(root, commit, "5.1.0", extraTarball.directory),
    /unexpected entry extra-5\.1\.0\.tgz/,
  );

  const extraFile = await makeArtifact(root, "5.1.0", 5, { extraFile: true });
  await writeFile(path.join(extraFile.directory, "release-commit.txt"), `${commit}\n`);
  await assert.rejects(
    verify(root, commit, "5.1.0", extraFile.directory),
    /unexpected entry unexpected\.txt/,
  );

  const incomplete = await makeArtifact(root, "5.1.0", 5);
  await writeFile(path.join(incomplete.directory, "release-commit.txt"), `${commit}\n`);
  await rm(path.join(incomplete.directory, tarballName(names[4], "5.1.0")));
  await assert.rejects(
    verify(root, commit, "5.1.0", incomplete.directory),
    /missing tarball/,
  );
});

test("rejects tag/commit drift and sha256 drift", async (t) => {
  const { root, commit } = await makeRepo("5.1.0");
  t.after(() => rm(root, { recursive: true, force: true }));
  const { directory, packages } = await makeArtifact(root, "5.1.0", 5);
  await writeFile(path.join(directory, "release-commit.txt"), `${commit}\n`);

  await assert.rejects(
    verify(root, "0".repeat(40), "5.1.0", directory),
    /release-commit\.txt is .*expected/,
  );

  await writeFile(path.join(directory, packages[0].tarball), "tampered\n");
  await assert.rejects(
    verify(root, commit, "5.1.0", directory),
    /sha256 is .*expected/,
  );
});
