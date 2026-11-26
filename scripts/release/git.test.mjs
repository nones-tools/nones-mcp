import assert from "node:assert/strict";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import test from "node:test";
import { cleanup, git, gitFixture, silent } from "./fixtures.mjs";
import { verifyTag } from "./git.mjs";

test("verify-tag checks tag alignment and main ancestry in an isolated Git repository", async (t) => {
  const root = await gitFixture();
  t.after(() => cleanup(root));

  const verified = await verifyTag({ root, tag: "v5.0.0", mainRef: "origin/main", logger: silent });
  assert.equal(verified.version, "5.0.0");

  await writeFile(path.join(root, "main-only.txt"), "next main commit\n");
  await git(root, ["add", "main-only.txt"]);
  await git(root, ["commit", "-qm", "main moves ahead"]);
  const mainCommit = (await git(root, ["rev-parse", "HEAD"])).stdout.trim();
  await git(root, ["update-ref", "refs/remotes/origin/main", mainCommit]);
  await git(root, ["checkout", "-q", "--detach", "v5.0.0"]);

  const stillAncestor = await verifyTag({
    root,
    tag: "v5.0.0",
    mainRef: "origin/main",
    logger: silent,
  });
  assert.equal(stillAncestor.commit, (await git(root, ["rev-parse", "HEAD"])).stdout.trim());

  await git(root, ["checkout", "-q", "--orphan", "side"]);
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-qm", "unrelated root"]);
  await git(root, ["tag", "-f", "v5.0.0"]);
  await assert.rejects(
    verifyTag({ root, tag: "v5.0.0", mainRef: "origin/main", logger: silent }),
    /not an ancestor of origin\/main/,
  );

  await assert.rejects(
    verifyTag({ root, tag: "v6.0.0", mainRef: "origin/main", skipAncestry: true, logger: silent }),
    /version/,
  );
});
