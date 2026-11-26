import { ReleaseError } from "./errors.mjs";
import { validateManifests } from "./manifests.mjs";
import { createLogger, defaultExec } from "./runner.mjs";
import { tagToVersion } from "./semver.mjs";

export async function verifyTag({
  root,
  tag,
  commit,
  mainRef = "origin/main",
  skipAncestry = false,
  exec = defaultExec,
  logger,
} = {}) {
  const log = createLogger(logger);
  const parsed = tagToVersion(tag);
  await validateManifests({ root, version: parsed.version });

  const git = async (args) => exec("git", args, { cwd: root });
  const tagCommit = (await git(["rev-parse", `${parsed.tag}^{commit}`])).stdout.trim();
  const headCommit = (await git(["rev-parse", "HEAD"])).stdout.trim();
  if (tagCommit !== headCommit) {
    throw new ReleaseError(`${parsed.tag} points to ${tagCommit}, but HEAD is ${headCommit}`);
  }
  if (commit && tagCommit !== commit) {
    throw new ReleaseError(`${parsed.tag} points to ${tagCommit}, expected ${commit}`);
  }

  if (!skipAncestry) {
    let mainCommit;
    try {
      mainCommit = (await git(["rev-parse", mainRef])).stdout.trim();
    } catch (error) {
      throw new ReleaseError(
        `Cannot resolve ${mainRef}; fetch the main branch before releasing\n${error.message}`,
      );
    }
    try {
      await git(["merge-base", "--is-ancestor", tagCommit, mainCommit]);
    } catch {
      throw new ReleaseError(`${parsed.tag} (${tagCommit}) is not an ancestor of ${mainRef}`);
    }
  }

  log.info(
    `${parsed.tag} matches ${parsed.version} manifests${
      skipAncestry ? "" : ` on ${mainRef}`
    }`,
  );
  return { tag: parsed.tag, version: parsed.version, commit: tagCommit };
}
