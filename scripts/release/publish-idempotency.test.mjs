import "./publish-integrity.test.mjs";
import assert from "node:assert/strict";
import path from "node:path";
import { rm, writeFile } from "node:fs/promises";
import test from "node:test";
import { PACKAGES } from "./constants.mjs";
import { cleanup, makeFixture, makeReleaseFiles, silent } from "./fixtures.mjs";
import { npmMock } from "./npm-mock.mjs";
import { publishRelease } from "./publish.mjs";

function allPublished() {
  return Object.fromEntries(PACKAGES.map((entry) => [entry.name, ["5.0.0"]]));
}

test("publish treats a concurrent publish conflict as idempotent success", async (t) => {
  const root = await makeFixture("5.0.0");
  t.after(() => cleanup(root));
  const { outDir, manifest } = await makeReleaseFiles(root);
  const mock = npmMock({ hooks: { manifest, conflictPublish: "@nones/mcp-core" } });
  const result = await publishRelease({
    root,
    tag: "v5.0.0",
    outDir,
    write: true,
    skipGit: true,
    exec: mock.exec,
    waitAttempts: 1,
    waitDelayMs: 0,
    logger: silent,
  });
  assert.equal(result.written, true);
  assert.equal(mock.calls.filter((call) => call.args[0] === "publish").length, PACKAGES.length);
});

test("already-published releases skip npm publish and --no-latest only moves staging", async (t) => {
  const root = await makeFixture("5.0.0");
  t.after(() => cleanup(root));
  const { outDir, manifest } = await makeReleaseFiles(root);
  const mock = npmMock({
    published: allPublished(),
    latest: Object.fromEntries(PACKAGES.map((entry) => [entry.name, "6.0.0"])),
    hooks: { manifest },
  });
  const result = await publishRelease({
    root,
    tag: "v5.0.0",
    outDir,
    write: true,
    skipGit: true,
    promoteLatest: false,
    exec: mock.exec,
    waitAttempts: 1,
    waitDelayMs: 0,
    logger: silent,
  });
  assert.equal(result.written, true);
  assert.equal(mock.calls.filter((call) => call.args[0] === "publish").length, 0);
  assert.equal(
    mock.calls.filter((call) => call.args[0] === "dist-tag" && call.args[3] === "latest").length,
    0,
  );
  assert.equal(
    mock.calls.filter((call) => call.args[0] === "dist-tag" && call.args[3] === "staging").length,
    PACKAGES.length,
  );
  for (const entry of PACKAGES) assert.equal(mock.tags.get(entry.name).latest, "6.0.0");
});

test("dist-tag permission failures surface actionable npm 403 guidance", async (t) => {
  const root = await makeFixture("5.0.0");
  t.after(() => cleanup(root));
  const { outDir, manifest } = await makeReleaseFiles(root);
  const mock = npmMock({
    published: allPublished(),
    latest: Object.fromEntries(PACKAGES.map((entry) => [entry.name, "4.0.0"])),
    hooks: { manifest, failDistTag: "latest" },
  });
  await assert.rejects(
    publishRelease({
      root,
      tag: "v5.0.0",
      outDir,
      write: true,
      skipGit: true,
      exec: mock.exec,
      waitAttempts: 1,
      waitDelayMs: 0,
      logger: silent,
    }),
    /both publish and dist-tag permissions/,
  );
});

test("publish requires a verified commit and intact hashes before any npm call", async (t) => {
  const root = await makeFixture("5.0.0");
  t.after(() => cleanup(root));
  const failingExec = async () => {
    throw new Error("npm must not run before artifact verification");
  };

  const missing = await makeReleaseFiles(root);
  await rm(path.join(missing.outDir, "release-commit.txt"));
  await assert.rejects(
    publishRelease({
      root,
      tag: "v5.0.0",
      outDir: missing.outDir,
      write: true,
      skipGit: true,
      exec: failingExec,
      logger: silent,
    }),
    /release-commit\.txt/,
  );

  const tampered = await makeReleaseFiles(root);
  await writeFile(path.join(tampered.outDir, tampered.manifest.packages[0].tarball), "tampered\n");
  await assert.rejects(
    publishRelease({
      root,
      tag: "v5.0.0",
      outDir: tampered.outDir,
      write: true,
      skipGit: true,
      exec: failingExec,
      logger: silent,
    }),
    /does not match the recorded sha256/,
  );
});
