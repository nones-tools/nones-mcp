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

export async function getVersionIntegrity(
  name,
  version,
  { exec = defaultExec, registry = DEFAULT_REGISTRY, cwd } = {},
) {
  try {
    const result = await npmView(
      [`${name}@${version}`, "dist.integrity"],
      { exec, registry, cwd },
    );
    const text = result.stdout.trim();
    if (!text) return null;
    let value = text;
    try {
      const parsed = JSON.parse(text);
      if (parsed === null || typeof parsed !== "string") return null;
      value = parsed;
    } catch {
      // npm may emit the raw SRI instead of a JSON string.
    }
    return value.startsWith("sha512-") ? value : null;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

function integrityMismatch(name, version, expected, actual) {
  return new ReleaseError(
    `Integrity mismatch for ${name}@${version}: local immutable tarball is ${expected}, ` +
      `registry dist.integrity is ${actual}. npm versions are immutable and cannot be overwritten.`,
  );
}

export async function assertRegistryIntegrity(name, version, expected, options = {}) {
  const actual = await getVersionIntegrity(name, version, options);
  if (!actual) {
    throw new ReleaseError(
      `${name}@${version} has no registry dist.integrity; refusing to skip an existing ` +
        `version without byte-for-byte proof of the local immutable tarball`,
    );
  }
  if (actual !== expected) throw integrityMismatch(name, version, expected, actual);
  return actual;
}

export async function waitForRegistryIntegrity(name, version, expected, options = {}) {
  const attempts = options.waitAttempts ?? 12;
  const delay = options.waitDelayMs ?? 5000;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const actual = await getVersionIntegrity(name, version, options);
    if (actual !== null && actual !== expected) {
      throw integrityMismatch(name, version, expected, actual);
    }
    if (actual === expected) return true;
    if (attempt < attempts) await sleep(delay);
  }
  throw new ReleaseError(
    `${name}@${version} has no registry dist.integrity after publishing; refusing to continue`,
  );
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
