import { DEFAULT_REGISTRY, DEFAULT_STAGING_DIST_TAG } from "./constants.mjs";
import { validateManifests } from "./manifests.mjs";
import { publishedVersionExists } from "./registry.mjs";
import { createLogger, defaultExec } from "./runner.mjs";
import { isPrerelease, tagToVersion } from "./semver.mjs";

export async function planRelease({
  root,
  tag,
  distTag = DEFAULT_STAGING_DIST_TAG,
  checkRegistry = false,
  registry = DEFAULT_REGISTRY,
  exec = defaultExec,
  logger,
} = {}) {
  const log = createLogger(logger);
  const parsed = tagToVersion(tag);
  const validated = await validateManifests({ root, version: parsed.version });
  const packages = validated.packages.map((entry) => ({
    ...entry,
    action: "publish",
    published: undefined,
  }));

  if (checkRegistry) {
    for (const entry of packages) {
      const published = await publishedVersionExists(entry.name, parsed.version, {
        exec,
        registry,
        cwd: root,
      });
      entry.published = published;
      entry.action = published ? "skip-existing" : "publish";
    }
  }

  const plan = {
    tag: parsed.tag,
    version: parsed.version,
    distTag,
    promoteLatest: !isPrerelease(parsed.version),
    registry,
    packages,
  };
  log.info(`release plan ${plan.tag} (${packages.length} packages, dist-tag ${distTag})`);
  for (const entry of packages) {
    log.info(`- ${entry.name}@${entry.version}: ${entry.action} (${entry.dir})`);
  }
  return plan;
}
