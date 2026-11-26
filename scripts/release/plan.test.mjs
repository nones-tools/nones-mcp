import assert from "node:assert/strict";
import test from "node:test";
import { PACKAGES } from "./constants.mjs";
import { cleanup, makeFixture, silent } from "./fixtures.mjs";
import { planRelease } from "./plan.mjs";

test("plan is deterministic and dependency ordered", async (t) => {
  const root = await makeFixture("5.0.0");
  t.after(() => cleanup(root));
  const plan = await planRelease({ root, tag: "v5.0.0", logger: silent });
  assert.equal(plan.version, "5.0.0");
  assert.equal(plan.distTag, "staging");
  assert.equal(plan.promoteLatest, true);
  assert.deepEqual(plan.packages.map((entry) => entry.name), PACKAGES.map((entry) => entry.name));
  assert.ok(plan.packages.every((entry) => entry.tarball.endsWith("-5.0.0.tgz")));
  assert.equal(plan.packages[1].tarball, "nones-journal-5.0.0.tgz");
  await assert.rejects(planRelease({ root, tag: "v5.0", logger: silent }), /Invalid SemVer/);
});
