import assert from "node:assert/strict";
import test from "node:test";
import { cleanup, makeFixture, makeReleaseFiles, silent } from "./fixtures.mjs";
import { npmMock } from "./npm-mock.mjs";
import { publishRelease } from "./publish.mjs";

test("publish dry-run performs no npm or git mutation", async (t) => {
  const root = await makeFixture("5.0.0");
  t.after(() => cleanup(root));
  const { outDir } = await makeReleaseFiles(root);
  const result = await publishRelease({
    root,
    tag: "v5.0.0",
    outDir,
    write: false,
    skipGit: true,
    exec: async () => {
      throw new Error("dry-run must not execute commands");
    },
    logger: silent,
  });
  assert.equal(result.written, false);
});

test("publish continues a partial release without overwriting and never downgrades latest", async (t) => {
  const root = await makeFixture("5.0.0");
  t.after(() => cleanup(root));
  const { outDir, manifest } = await makeReleaseFiles(root);
  const mock = npmMock({
    published: {
      "@nones/mcp-core": ["5.0.0"],
      "@nones/journal": ["5.0.0"],
    },
    latest: {
      "@nones/mcp-core": "5.0.0",
      "@nones/journal": "4.0.0",
      "@nones/kaiten-mcp": "9.9.9",
    },
    hooks: { manifest },
  });

  const result = await publishRelease({
    root,
    tag: "v5.0.0",
    outDir,
    write: true,
    skipGit: true,
    provenance: true,
    exec: mock.exec,
    waitAttempts: 1,
    waitDelayMs: 0,
    logger: silent,
  });

  assert.equal(result.written, true);
  const publishCalls = mock.calls.filter((call) => call.args[0] === "publish");
  assert.deepEqual(
    publishCalls.map(
      (call) => manifest.packages.find((entry) => call.args[1].endsWith(entry.tarball)).name,
    ),
    ["@nones/kaiten-mcp", "@nones/opencode-mcp"],
  );
  assert.ok(publishCalls.every((call) => call.args.includes("--ignore-scripts")));
  assert.ok(publishCalls.every((call) => call.args.includes("--provenance")));
  assert.deepEqual(
    result.packages.map((entry) => entry.action),
    ["skip-existing", "skip-existing", "published", "published"],
  );

  const latestAdds = mock.calls
    .filter((call) => call.args[0] === "dist-tag" && call.args[3] === "latest")
    .map((call) => call.args[2].slice(0, call.args[2].lastIndexOf("@")));
  assert.deepEqual(latestAdds, ["@nones/journal", "@nones/opencode-mcp"]);
  assert.equal(mock.tags.get("@nones/kaiten-mcp").latest, "9.9.9");
  assert.equal(mock.tags.get("@nones/mcp-core").latest, "5.0.0");
});

test("publish failure propagates and a later run resumes the partial release", async (t) => {
  const root = await makeFixture("5.0.0");
  t.after(() => cleanup(root));
  const { outDir, manifest } = await makeReleaseFiles(root);
  const failing = npmMock({ hooks: { manifest, failPublish: "@nones/kaiten-mcp" } });

  await assert.rejects(
    publishRelease({
      root,
      tag: "v5.0.0",
      outDir,
      write: true,
      skipGit: true,
      exec: failing.exec,
      waitAttempts: 1,
      waitDelayMs: 0,
      logger: silent,
    }),
    /publish failed for @nones\/kaiten-mcp/,
  );
  const publishedBefore = failing.calls
    .filter((call) => call.args[0] === "publish" && !call.args[1].includes("kaiten"))
    .map((call) => manifest.packages.find((entry) => call.args[1].endsWith(entry.tarball)).name);
  assert.deepEqual(publishedBefore, ["@nones/mcp-core", "@nones/journal"]);
  assert.equal(failing.tags.get("@nones/mcp-core").latest, undefined);
  assert.equal(failing.calls.filter((call) => call.args[0] === "dist-tag").length, 0);

  const resumed = npmMock({
    published: {
      "@nones/mcp-core": ["5.0.0"],
      "@nones/journal": ["5.0.0"],
    },
    latest: {
      "@nones/mcp-core": "5.0.0",
      "@nones/journal": "5.0.0",
    },
    hooks: { manifest },
  });
  const result = await publishRelease({
    root,
    tag: "v5.0.0",
    outDir,
    write: true,
    skipGit: true,
    exec: resumed.exec,
    waitAttempts: 1,
    waitDelayMs: 0,
    logger: silent,
  });
  assert.deepEqual(
    resumed.calls
      .filter((call) => call.args[0] === "publish")
      .map((call) => manifest.packages.find((entry) => call.args[1].endsWith(entry.tarball)).name),
    ["@nones/kaiten-mcp", "@nones/opencode-mcp"],
  );
  assert.deepEqual(result.packages.map((entry) => entry.action), [
    "skip-existing",
    "skip-existing",
    "published",
    "published",
  ]);
});
