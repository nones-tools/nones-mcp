import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import test from "node:test";
import { PACKAGES } from "./constants.mjs";
import { cleanup, makeFixture, makeReleaseFiles, silent, TEST_COMMIT } from "./fixtures.mjs";
import { readReleaseManifest } from "./artifact-manifest.mjs";
import { packRelease } from "./pack.mjs";
import { tarballName } from "./semver.mjs";
import { verifyInstall } from "./install.mjs";

test("pack uses --ignore-scripts, writes checksums and verifies the exact tarballs", async (t) => {
  const root = await makeFixture("5.0.0");
  t.after(() => cleanup(root));
  const outDir = path.join(root, ".tmp", "release", "v5.0.0");
  const manifestNames = new Map();
  for (const entry of PACKAGES) {
    manifestNames.set(
      entry.dir,
      JSON.parse(await readFile(path.join(root, entry.dir, "package.json"), "utf8")),
    );
  }
  const calls = [];
  const exec = async (command, args, options = {}) => {
    calls.push({ command, args: [...args], cwd: options.cwd });
    if (command === process.execPath) return { stdout: "", stderr: "", code: 0 };
    assert.equal(command, "npm");
    if (args[0] === "pack") {
      const destination = args[args.indexOf("--pack-destination") + 1];
      const pkg = manifestNames.get(path.relative(root, options.cwd));
      const filename = tarballName(pkg.name, "5.0.0");
      await mkdir(destination, { recursive: true });
      await writeFile(path.join(destination, filename), `packed:${pkg.name}\n`);
      const files = [{ path: "dist/index.js" }, { path: "dist/index.d.ts" }];
      for (const target of Object.values(pkg.bin ?? {})) {
        files.push({ path: target.replace(/^\.\//, "") });
      }
      return { stdout: JSON.stringify([{ filename, files }]), stderr: "", code: 0 };
    }
    if (args[0] === "install") return { stdout: "", stderr: "", code: 0 };
    throw new Error(`unexpected command ${command} ${args.join(" ")}`);
  };

  const manifest = await packRelease({
    root,
    tag: "v5.0.0",
    outDir,
    commit: TEST_COMMIT,
    installSmoke: true,
    exec,
    logger: silent,
  });
  assert.equal(manifest.packages.length, PACKAGES.length);
  assert.equal(manifest.commit, TEST_COMMIT);
  const packCalls = calls.filter((call) => call.args[0] === "pack");
  assert.equal(packCalls.length, PACKAGES.length);
  assert.ok(packCalls.every((call) => call.args.includes("--ignore-scripts")));
  const install = calls.find((call) => call.args[0] === "install");
  assert.ok(install);
  assert.ok(install.args.includes("--ignore-scripts"));
  assert.equal(install.args.filter((value) => value.endsWith(".tgz")).length, PACKAGES.length);

  const loaded = await readReleaseManifest({ root, outDir });
  assert.equal(loaded.packages.length, PACKAGES.length);
  assert.equal(await readFile(path.join(outDir, "release-commit.txt"), "utf8"), `${TEST_COMMIT}\n`);
  const sums = await readFile(path.join(outDir, "SHA256SUMS"), "utf8");
  for (const entry of loaded.packages) assert.match(sums, new RegExp(entry.sha256));

  const first = path.join(outDir, loaded.packages[0].tarball);
  await writeFile(first, "tampered\n");
  await assert.rejects(readReleaseManifest({ root, outDir }), /does not match the recorded sha256/);
});

test("verifyInstall passes only the exact released tarballs", async (t) => {
  const root = await makeFixture("5.0.0");
  t.after(() => cleanup(root));
  const { outDir, manifest } = await makeReleaseFiles(root);
  const calls = [];
  const exec = async (command, args, options = {}) => {
    calls.push({ command, args: [...args], cwd: options.cwd });
    return { stdout: "", stderr: "", code: 0 };
  };
  await verifyInstall({ root, outDir, manifest, exec, logger: silent });
  const install = calls.find((call) => call.command === "npm" && call.args[0] === "install");
  assert.ok(install.args.includes("--ignore-scripts"));
  assert.equal(
    install.args.filter((value) => value.endsWith(".tgz")).length,
    manifest.packages.length,
  );
  const nodeCheck = calls.find((call) => call.command === process.execPath);
  assert.ok(nodeCheck);
  assert.match(nodeCheck.args.at(-1), /install smoke passed/);
});
