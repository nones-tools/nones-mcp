import path from "node:path";
import { DEFAULT_REGISTRY, DEFAULT_STAGING_DIST_TAG, PACKAGES } from "./constants.mjs";
import { ReleaseError } from "./errors.mjs";
import { readArtifactCommit, readReleaseManifest } from "./artifact-manifest.mjs";
import { verifyTag } from "./git.mjs";
import { validateManifests } from "./manifests.mjs";
import { ensureStagingTags, promoteLatest } from "./promotion.mjs";
import { isPublishConflict, publishedVersionExists, waitForPublished } from "./registry.mjs";
import { createLogger, defaultExec } from "./runner.mjs";
import { tagToVersion } from "./semver.mjs";

export async function publishRelease({
  root,
  tag,
  outDir,
  distTag = DEFAULT_STAGING_DIST_TAG,
  promoteLatest: shouldPromoteLatest = true,
  write = false,
  provenance = false,
  registry = DEFAULT_REGISTRY,
  mainRef = "origin/main",
  skipGit = false,
  skipAncestry = false,
  waitAttempts,
  waitDelayMs,
  exec = defaultExec,
  logger,
} = {}) {
  const log = createLogger(logger);
  const parsed = tagToVersion(tag);
  let verified;
  if (write && !skipGit) {
    verified = await verifyTag({
      root,
      tag: parsed.tag,
      mainRef,
      skipAncestry,
      exec,
      logger,
    });
  } else {
    await validateManifests({ root, version: parsed.version });
  }

  const manifest = await readReleaseManifest({ root, outDir });
  if (manifest.tag !== parsed.tag || manifest.version !== parsed.version) {
    throw new ReleaseError(
      `release manifest ${manifest.tag} does not match requested tag ${parsed.tag}`,
    );
  }
  const artifactCommit = await readArtifactCommit(manifest.outDir);
  if (verified && artifactCommit !== verified.commit) {
    throw new ReleaseError(
      `verified artifact commit ${artifactCommit} does not match ${parsed.tag} (${verified.commit})`,
    );
  }

  const ordered = PACKAGES.map((spec) => {
    const entry = manifest.packages.find((candidate) => candidate.name === spec.name);
    if (!entry) throw new ReleaseError(`release manifest is missing ${spec.name}`);
    return { ...entry, dir: spec.dir };
  });

  if (!write) {
    log.info(`publish ${parsed.tag} (dry run; pass --write to publish)`);
    log.info(`order: ${ordered.map((entry) => entry.name).join(" -> ")}`);
    log.info(
      `staging dist-tag: ${distTag}; latest is ${
        shouldPromoteLatest ? "promoted only after all versions exist" : "left unchanged"
      }`,
    );
    for (const entry of ordered) log.info(`- would preflight ${entry.name}@${entry.version}`);
    return { written: false, tag: parsed.tag, version: parsed.version, packages: ordered };
  }

  const options = { exec, registry, root, waitAttempts, waitDelayMs, promoteLatest: shouldPromoteLatest };
  const state = new Map();
  for (const entry of ordered) {
    const exists = await publishedVersionExists(entry.name, entry.version, {
      exec,
      registry,
      cwd: root,
    });
    state.set(entry.name, { exists });
    log.info(`${entry.name}@${entry.version}: ${exists ? "already published" : "needs publish"}`);
  }

  for (const entry of ordered) {
    if (state.get(entry.name).exists) {
      log.info(`skip ${entry.name}@${entry.version}; npm packages are never overwritten`);
      continue;
    }
    const tarball = path.join(manifest.outDir, entry.tarball);
    const args = [
      "publish",
      tarball,
      "--tag",
      distTag,
      "--access",
      "public",
      "--ignore-scripts",
      "--registry",
      registry,
    ];
    if (provenance) args.push("--provenance");
    try {
      await exec("npm", args, { cwd: path.join(root, entry.dir) });
      log.info(`published ${entry.name}@${entry.version} with dist-tag ${distTag}`);
    } catch (error) {
      if (!isPublishConflict(error)) throw error;
      const nowExists = await publishedVersionExists(entry.name, entry.version, {
        exec,
        registry,
        cwd: root,
      });
      if (!nowExists) throw error;
      log.info(`${entry.name}@${entry.version} appeared during publish; continuing`);
    }
    await waitForPublished(entry.name, entry.version, options);
  }

  for (const entry of ordered) await waitForPublished(entry.name, entry.version, options);
  log.info(`all ${ordered.length} exact versions are present in the registry`);

  await ensureStagingTags(ordered, distTag, options, log);
  const latest = await promoteLatest(ordered, parsed.version, options, log);

  return {
    written: true,
    tag: parsed.tag,
    version: parsed.version,
    distTag,
    commit: artifactCommit,
    packages: ordered.map((entry) => ({
      name: entry.name,
      version: entry.version,
      action: state.get(entry.name).exists ? "skip-existing" : "published",
    })),
    latest,
  };
}
