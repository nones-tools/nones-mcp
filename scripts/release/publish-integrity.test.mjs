import assert from "node:assert/strict";
import test from "node:test";
import { PACKAGES } from "./constants.mjs";
import { cleanup, makeFixture, makeReleaseFiles, silent } from "./fixtures.mjs";
import { npmMock } from "./npm-mock.mjs";
import { publishRelease } from "./publish.mjs";

function publishedVersions(names) {
  return Object.fromEntries(names.map((name) => [name, ["5.0.0"]]));
}

test("publish fails closed when an existing version has mismatched registry integrity", async (t) => {
  const root = await makeFixture("5.0.0");
  t.after(() => cleanup(root));
  const { outDir, manifest } = await makeReleaseFiles(root);
  const mock = npmMock({
    published: publishedVersions(PACKAGES.map((entry) => entry.name)),
    latest: Object.fromEntries(PACKAGES.map((entry) => [entry.name, "5.0.0"])),
    integrities: { "@nones/mcp-core": { "5.0.0": "sha512-not-the-local-tarball" } },
    hooks: { manifest },
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
    /Integrity mismatch for @nones\/mcp-core@5\.0\.0[\s\S]*cannot be overwritten/,
  );
  assert.equal(mock.calls.filter((call) => call.args[0] === "publish").length, 0);
  assert.equal(mock.calls.filter((call) => call.args[0] === "dist-tag").length, 0);
});

test("publish fails closed when an existing version has no registry integrity", async (t) => {
  const root = await makeFixture("5.0.0");
  t.after(() => cleanup(root));
  const { outDir, manifest } = await makeReleaseFiles(root);
  const mock = npmMock({
    published: publishedVersions(["@nones/mcp-core"]),
    integrities: { "@nones/mcp-core": { "5.0.0": null } },
    hooks: { manifest },
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
    /has no registry dist\.integrity/,
  );
  assert.equal(mock.calls.filter((call) => call.args[0] === "publish").length, 0);
});

test("publish rejects a concurrent conflict whose registry integrity differs", async (t) => {
  const root = await makeFixture("5.0.0");
  t.after(() => cleanup(root));
  const { outDir, manifest } = await makeReleaseFiles(root);
  const mock = npmMock({
    integrities: { "@nones/mcp-core": { "5.0.0": "sha512-conflicting-bytes" } },
    hooks: { manifest, conflictPublish: "@nones/mcp-core" },
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
    /Integrity mismatch for @nones\/mcp-core@5\.0\.0/,
  );
  assert.equal(mock.calls.filter((call) => call.args[0] === "publish").length, 1);
  assert.equal(mock.calls.filter((call) => call.args[0] === "dist-tag").length, 0);
});

test("publish resumes a partial release when existing versions match local integrity", async (t) => {
  const root = await makeFixture("5.0.0");
  t.after(() => cleanup(root));
  const { outDir, manifest } = await makeReleaseFiles(root);
  const existing = ["@nones/mcp-core", "@nones/journal"];
  const missing = ["@nones/kaiten-mcp", "@nones/opencode-mcp", "@nones/dsh-session-mcp"];
  const mock = npmMock({
    published: publishedVersions(existing),
    latest: Object.fromEntries(existing.map((name) => [name, "5.0.0"])),
    hooks: { manifest },
  });

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

  assert.deepEqual(result.packages.map((entry) => entry.action), [
    "skip-existing",
    "skip-existing",
    "published",
    "published",
    "published",
  ]);
  assert.deepEqual(
    mock.calls
      .filter((call) => call.args[0] === "publish")
      .map((call) => manifest.packages.find((entry) => call.args[1].endsWith(entry.tarball)).name),
    missing,
  );
});
