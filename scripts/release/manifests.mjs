import path from "node:path";
import {
  DEPENDENCY_FIELDS,
  DEPRECATED_PACKAGE_NAMES,
  NPM_NAME_PATTERN,
  PACKAGES,
  PACKAGE_NAMES,
  REQUIRED_BINS,
} from "./constants.mjs";
import { ReleaseError } from "./errors.mjs";
import { displayPath, readJson } from "./io.mjs";
import { normalizeVersion, SEMVER_PATTERN, tarballName, versionToTag } from "./semver.mjs";

export function validatePackageName(name) {
  if (
    typeof name !== "string" ||
    name.length > 214 ||
    !NPM_NAME_PATTERN.test(name) ||
    name.split("/").length !== 2
  ) {
    throw new ReleaseError(
      `Invalid npm package name ${JSON.stringify(name)}; expected exactly one @scope/name slash`,
    );
  }
  return name;
}

export function assertNoDeprecatedReferences(pkg, label) {
  for (const field of DEPENDENCY_FIELDS) {
    const values = pkg[field];
    if (!values || typeof values !== "object" || Array.isArray(values)) continue;
    for (const deprecated of DEPRECATED_PACKAGE_NAMES) {
      if (deprecated in values) {
        throw new ReleaseError(
          `${label} still references retired package ${deprecated}; migrate to @nones/journal first`,
        );
      }
    }
  }
}

export function validateJournalExports(pkg) {
  if (pkg.name !== "@nones/journal") return;
  const sqlite = pkg.exports?.["./sqlite"];
  if (
    !sqlite ||
    typeof sqlite !== "object" ||
    typeof sqlite.types !== "string" ||
    typeof sqlite.import !== "string"
  ) {
    throw new ReleaseError(
      "@nones/journal must expose a typed ./sqlite export (public usage @nones/journal/sqlite)",
    );
  }
}

export function internalDependencyVersionsFromObject(pkg) {
  const versions = [];
  for (const field of DEPENDENCY_FIELDS) {
    const values = pkg[field];
    if (!values || typeof values !== "object" || Array.isArray(values)) continue;
    for (const name of PACKAGE_NAMES) {
      if (name in values) versions.push(values[name]);
    }
  }
  return versions;
}

function assertInternalDependenciesExact(pkg, version) {
  for (const field of DEPENDENCY_FIELDS) {
    const values = pkg[field];
    if (!values || typeof values !== "object" || Array.isArray(values)) continue;
    for (const name of PACKAGE_NAMES) {
      if (!(name in values)) continue;
      if (values[name] !== version) {
        throw new ReleaseError(
          `${pkg.name} ${field}.${name} must be exactly ${version}, got ${values[name]}`,
        );
      }
    }
  }
}

export async function validateManifests({ root, version }) {
  const target = normalizeVersion(version);
  const rootPackage = await readJson(path.join(root, "package.json"));
  if (rootPackage.version !== target) {
    throw new ReleaseError(
      `root package.json version ${rootPackage.version} does not match ${target}`,
    );
  }
  if (rootPackage.private !== true) {
    throw new ReleaseError("root package.json must remain private");
  }
  assertNoDeprecatedReferences(rootPackage, "root package.json");

  const seen = new Set();
  const packages = [];
  for (const entry of PACKAGES) {
    const file = path.join(root, entry.dir, "package.json");
    const pkg = await readJson(file);
    validatePackageName(pkg.name);
    if (pkg.name !== entry.name) {
      throw new ReleaseError(`${displayPath(root, file)} is ${pkg.name}, expected ${entry.name}`);
    }
    if (seen.has(pkg.name)) throw new ReleaseError(`Duplicate package name ${pkg.name}`);
    seen.add(pkg.name);
    if (pkg.version !== target) {
      throw new ReleaseError(
        `${pkg.name} version ${pkg.version} does not match release ${target}`,
      );
    }
    if (!SEMVER_PATTERN.test(pkg.version)) {
      throw new ReleaseError(`${pkg.name} has an invalid SemVer version ${pkg.version}`);
    }
    assertNoDeprecatedReferences(pkg, pkg.name);
    validateJournalExports(pkg);
    for (const bin of REQUIRED_BINS[pkg.name]) {
      if (!pkg.bin || typeof pkg.bin[bin] !== "string") {
        throw new ReleaseError(`${pkg.name} is missing the required ${bin} executable bin`);
      }
    }
    assertInternalDependenciesExact(pkg, target);
    packages.push({
      name: pkg.name,
      dir: entry.dir,
      version: pkg.version,
      bins: Object.keys(pkg.bin ?? {}).sort(),
      tarball: tarballName(pkg.name, target),
    });
  }

  const rootInternal = internalDependencyVersionsFromObject(rootPackage);
  if (rootInternal.some((value) => value !== target)) {
    throw new ReleaseError(`root package.json @nones dependencies must be exactly ${target}`);
  }

  return { version: target, tag: versionToTag(target), packages };
}
