import assert from "node:assert/strict";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import test from "node:test";
import { PACKAGES } from "./constants.mjs";
import { cleanup, makeFixture, readManifests, snapshot, silent, FILES } from "./fixtures.mjs";
import { validateLock } from "./lock.mjs";
import { validateManifests } from "./manifests.mjs";
import { compareSemver, isPrerelease, normalizeVersion, tarballName } from "./semver.mjs";
import { versionCommand } from "./version.mjs";

test("version dry-run leaves every file unchanged", async (t) => {
  const root = await makeFixture(null);
  t.after(() => cleanup(root));
  const before = await snapshot(root);
  const result = await versionCommand({ root, version: "9.8.7", write: false, logger: silent });
  assert.equal(result.written, false);
  assert.ok(result.changes.length > 0);
  const after = await snapshot(root);
  for (const relative of FILES) assert.equal(after.get(relative), before.get(relative), relative);
});

test("version writes a stale root version even when root @nones deps are unchanged or empty", async (t) => {
  for (const emptyInternalDependencies of [false, true]) {
    const root = await makeFixture("5.0.0");
    t.after(() => cleanup(root));
    const rootFile = path.join(root, "package.json");
    const rootPackage = JSON.parse(await readFile(rootFile, "utf8"));
    rootPackage.version = "0.0.0";
    if (emptyInternalDependencies) {
      for (const name of Object.keys(rootPackage.devDependencies)) {
        if (name.startsWith("@nones/")) delete rootPackage.devDependencies[name];
      }
    }
    await writeFile(rootFile, `${JSON.stringify(rootPackage, null, 2)}\n`);

    const result = await versionCommand({ root, version: "5.0.0", write: true, logger: silent });
    assert.equal(result.written, true);
    assert.ok(result.changes.includes("package.json version: 0.0.0 -> 5.0.0"));
    assert.equal(JSON.parse(await readFile(rootFile, "utf8")).version, "5.0.0");
    await validateManifests({ root, version: "5.0.0" });
  }
});

test("version synchronizes root, all four workspaces, dependencies and bun.lock", async (t) => {
  // Start from a stale released state so the 5.0.0 synchronization is observable.
  const root = await makeFixture("4.9.0");
  t.after(() => cleanup(root));
  const before = await readManifests(root);
  const lockBefore = await readFile(path.join(root, "bun.lock"), "utf8");
  const packagesBefore = lockBefore.slice(lockBefore.indexOf('\n  "packages": {'));

  const result = await versionCommand({ root, version: "5.0.0", write: true, logger: silent });
  assert.equal(result.written, true);
  await validateManifests({ root, version: "5.0.0" });
  await validateLock(root, "5.0.0");

  const rootPackage = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  assert.equal(rootPackage.version, "5.0.0");
  for (const [name, value] of Object.entries(rootPackage.devDependencies)) {
    if (name.startsWith("@nones/")) assert.equal(value, "5.0.0");
  }

  const after = await readManifests(root);
  after.forEach((pkg, index) => {
    assert.equal(pkg.version, "5.0.0");
    assert.equal(pkg.name, before[index].name);
    assert.deepEqual(pkg.bin, before[index].bin);
    for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
      for (const [name, value] of Object.entries(pkg[field] ?? {})) {
        if (name.startsWith("@nones/")) assert.equal(value, "5.0.0", `${pkg.name} ${field}.${name}`);
      }
    }
  });

  const lockAfter = await readFile(path.join(root, "bun.lock"), "utf8");
  assert.equal(
    lockAfter.slice(lockAfter.indexOf('\n  "packages": {')),
    packagesBefore,
    "external lock entries must not change",
  );
  assert.match(lockAfter, /"apps\/core": \{[\s\S]*?"version": "5\.0\.0"/);

  const stable = await snapshot(root);
  const second = await versionCommand({ root, version: "5.0.0", write: true, logger: silent });
  assert.equal(second.written, false);
  const stableAgain = await snapshot(root);
  for (const relative of FILES) assert.equal(stableAgain.get(relative), stable.get(relative), relative);

  await versionCommand({ root, version: "6.1.0", write: true, logger: silent });
  await validateManifests({ root, version: "6.1.0" });
  await validateLock(root, "6.1.0");
  assert.match(await readFile(path.join(root, "bun.lock"), "utf8"), /"version": "6\.1\.0"/);
});

test("version rejects malformed SemVer, retired names and bad npm names", async (t) => {
  const root = await makeFixture(null);
  t.after(() => cleanup(root));
  for (const value of ["5", "5.0", "05.0.0", "5.0.0.0", "v5.0.0-01", "5.0.0/extra"]) {
    await assert.rejects(
      versionCommand({ root, version: value, write: true, logger: silent }),
      /Invalid SemVer/,
      value,
    );
  }

  const kaiten = path.join(root, "apps/kaiten/package.json");
  const pkg = JSON.parse(await readFile(kaiten, "utf8"));
  pkg.name = "@nones/foo/bar";
  await writeFile(kaiten, `${JSON.stringify(pkg, null, 2)}\n`);
  await assert.rejects(
    versionCommand({ root, version: "5.0.0", write: true, logger: silent }),
    /Invalid npm package name/,
  );

  const journal = path.join(root, "adapters/journal/package.json");
  const journalPackage = JSON.parse(await readFile(journal, "utf8"));
  journalPackage.name = "@nones/journal";
  journalPackage.dependencies = { "@nones/mcp-journal-sqlite": "0.1.0" };
  await writeFile(journal, `${JSON.stringify(journalPackage, null, 2)}\n`);
  await assert.rejects(
    versionCommand({ root, version: "5.0.0", write: true, logger: silent }),
    /retired package @nones\/mcp-journal-sqlite/,
  );
});

test("SemVer comparison and prerelease detection are deterministic", () => {
  assert.equal(normalizeVersion("v5.0.0"), "5.0.0");
  assert.equal(compareSemver("5.0.0", "4.9.9"), 1);
  assert.equal(compareSemver("5.0.0", "5.0.0"), 0);
  assert.equal(compareSemver("5.0.0-rc.2", "5.0.0-rc.1"), 1);
  assert.equal(compareSemver("5.0.0", "5.0.0-rc.1"), 1);
  assert.equal(isPrerelease("5.0.0-rc.1"), true);
  assert.equal(isPrerelease("5.0.0"), false);
  assert.equal(tarballName("@nones/journal", "5.0.0"), "nones-journal-5.0.0.tgz");
  assert.deepEqual(PACKAGES.map((entry) => entry.name), [
    "@nones/mcp-core",
    "@nones/journal",
    "@nones/kaiten-mcp",
    "@nones/opencode-mcp",
  ]);
});
