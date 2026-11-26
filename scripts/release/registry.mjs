import { ReleaseError } from "./errors.mjs";
import { defaultExec, sleep } from "./runner.mjs";
import { DEFAULT_REGISTRY } from "./constants.mjs";

function isNotFoundError(error) {
  const text = `${error?.message ?? ""}\n${error?.stderr ?? ""}\n${error?.stdout ?? ""}`;
  return /\bE404\b|404 Not Found|is not in this registry/i.test(text);
}

export function isPublishConflict(error) {
  const text = `${error?.message ?? ""}\n${error?.stderr ?? ""}\n${error?.stdout ?? ""}`;
  return /EPUBLISHCONFLICT|cannot publish over|previously published versions/i.test(text);
}

async function npmView(args, { exec, registry, cwd }) {
  return exec("npm", ["view", ...args, "--json", "--registry", registry], { cwd });
}

export async function getDistTags(
  name,
  { exec = defaultExec, registry = DEFAULT_REGISTRY, cwd } = {},
) {
  try {
    const result = await npmView([name, "dist-tags"], { exec, registry, cwd });
    const value = result.stdout.trim();
    return value ? JSON.parse(value) : {};
  } catch (error) {
    if (isNotFoundError(error)) return {};
    throw error;
  }
}

export async function publishedVersionExists(
  name,
  version,
  { exec = defaultExec, registry = DEFAULT_REGISTRY, cwd } = {},
) {
  try {
    const result = await npmView([`${name}@${version}`, "version"], { exec, registry, cwd });
    return Boolean(result.stdout.trim());
  } catch (error) {
    if (isNotFoundError(error)) return false;
    throw error;
  }
}

export async function waitForPublished(name, version, options = {}) {
  const attempts = options.waitAttempts ?? 12;
  const delay = options.waitDelayMs ?? 5000;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (await publishedVersionExists(name, version, options)) return true;
    if (attempt < attempts) await sleep(delay);
  }
  throw new ReleaseError(`${name}@${version} is not visible in the registry after publishing`);
}
