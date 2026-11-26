import { ReleaseError } from "./errors.mjs";
import { getDistTags } from "./registry.mjs";
import { compareSemver, isPrerelease } from "./semver.mjs";

async function addDistTag(name, version, distTag, { exec, registry, root }) {
  try {
    await exec(
      "npm",
      ["dist-tag", "add", `${name}@${version}`, distTag, "--registry", registry],
      { cwd: root },
    );
  } catch (error) {
    const text = `${error?.message ?? ""}\n${error?.stderr ?? ""}\n${error?.stdout ?? ""}`;
    if (/\b403\b|forbidden/i.test(text)) {
      throw new ReleaseError(
        `npm denied dist-tag ${distTag} for ${name}@${version}. The npm trusted publisher ` +
          `needs both publish and dist-tag permissions; direct tokens also need each permission ` +
          `independently. Original error: ${error.message}`,
      );
    }
    throw error;
  }
}

export async function ensureStagingTags(entries, distTag, options, log) {
  const { exec, registry, root } = options;
  for (const entry of entries) {
    const tags = await getDistTags(entry.name, { exec, registry, cwd: root });
    if (tags[distTag] === entry.version) continue;
    await addDistTag(entry.name, entry.version, distTag, options);
    log.info(`${entry.name}: ${distTag} -> ${entry.version}`);
  }
}

export async function promoteLatest(entries, version, options, log) {
  const { exec, registry, root } = options;
  const latest = [];
  if (!options.promoteLatest) {
    log.info("latest promotion disabled for this run (bootstrap); staging tag was updated");
    return latest;
  }
  if (isPrerelease(version)) {
    log.info(`prerelease ${version}: latest is not moved`);
    return latest;
  }

  for (const entry of entries) {
    const tags = await getDistTags(entry.name, { exec, registry, cwd: root });
    const current = tags.latest;
    if (!current) {
      await addDistTag(entry.name, entry.version, "latest", options);
      latest.push({ name: entry.name, from: null, to: entry.version });
      log.info(`${entry.name}: latest (unset) -> ${entry.version}`);
    } else if (compareSemver(entry.version, current) > 0) {
      await addDistTag(entry.name, entry.version, "latest", options);
      latest.push({ name: entry.name, from: current, to: entry.version });
      log.info(`${entry.name}: latest ${current} -> ${entry.version}`);
    } else {
      log.info(`${entry.name}: latest stays ${current}; not downgrading to ${entry.version}`);
    }
  }
  return latest;
}
