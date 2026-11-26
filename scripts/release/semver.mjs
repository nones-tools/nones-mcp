import { ReleaseError } from "./errors.mjs";

export const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function normalizeVersion(input) {
  if (typeof input !== "string") throw new ReleaseError("A version string is required");
  let value = input.trim();
  if (value.startsWith("refs/tags/")) value = value.slice("refs/tags/".length);
  if (value.startsWith("v")) value = value.slice(1);
  if (!SEMVER_PATTERN.test(value)) {
    throw new ReleaseError(`Invalid SemVer version: ${JSON.stringify(input)}`);
  }
  return value;
}

export function versionToTag(version) {
  return `v${normalizeVersion(version)}`;
}

export function tagToVersion(tag) {
  if (typeof tag !== "string") throw new ReleaseError("A tag is required");
  let value = tag.trim();
  if (value.startsWith("refs/tags/")) value = value.slice("refs/tags/".length);
  if (!value.startsWith("v")) {
    throw new ReleaseError(`Release tags must look like vX.Y.Z, got ${JSON.stringify(tag)}`);
  }
  const version = normalizeVersion(value);
  return { tag: `v${version}`, version };
}

export function parseSemver(value) {
  const raw = normalizeVersion(value);
  const match = SEMVER_PATTERN.exec(raw);
  if (!match) throw new ReleaseError(`Invalid SemVer version: ${JSON.stringify(value)}`);
  return {
    raw,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split(".") : [],
    build: match[5] ? match[5].split(".") : [],
  };
}

export function isPrerelease(value) {
  return parseSemver(value).prerelease.length > 0;
}

function comparePrerelease(left, right) {
  if (left.length === 0 && right.length === 0) return 0;
  if (left.length === 0) return 1;
  if (right.length === 0) return -1;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    const aNumeric = /^\d+$/.test(a);
    const bNumeric = /^\d+$/.test(b);
    if (aNumeric && bNumeric) {
      const difference = Number(a) - Number(b);
      if (difference !== 0) return difference < 0 ? -1 : 1;
    } else if (aNumeric !== bNumeric) {
      return aNumeric ? -1 : 1;
    } else if (a !== b) {
      return a < b ? -1 : 1;
    }
  }
  return 0;
}

export function compareSemver(left, right) {
  const a = parseSemver(left);
  const b = parseSemver(right);
  for (const key of ["major", "minor", "patch"]) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  return comparePrerelease(a.prerelease, b.prerelease);
}

export function tarballName(name, version) {
  return `${name.replace(/^@/, "").replace(/\//g, "-")}-${normalizeVersion(version)}.tgz`;
}
