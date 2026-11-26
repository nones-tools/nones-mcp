import { existsSync } from "node:fs";
import path from "node:path";
import {
  DEPENDENCY_FIELDS,
  PACKAGES,
  PACKAGE_NAMES,
} from "./constants.mjs";
import { ReleaseError } from "./errors.mjs";
import { atomicWrite, displayPath, formatJson, readJson, readText } from "./io.mjs";
import {
  assertNoDeprecatedReferences,
  validateJournalExports,
  validateManifests,
  validatePackageName,
} from "./manifests.mjs";
import { updateLockText, validateLock } from "./lock.mjs";
import { createLogger } from "./runner.mjs";
import { normalizeVersion } from "./semver.mjs";

function updateInternalDependencies(pkg, version) {
  const changes = [];
  for (const field of DEPENDENCY_FIELDS) {
    const values = pkg[field];
    if (!values || typeof values !== "object" || Array.isArray(values)) continue;
    for (const name of PACKAGE_NAMES) {
      if (!(name in values) || values[name] === version) continue;
      changes.push(`${field}.${name}: ${values[name]} -> ${version}`);
      values[name] = version;
    }
  }
  return changes;
}

export async function versionCommand({
  root,
  version,
  write = false,
  logger,
} = {}) {
  const log = createLogger(logger);
  const target = normalizeVersion(version);
  const rootFile = path.join(root, "package.json");
  const lockFile = path.join(root, "bun.lock");
  const rootPackage = await readJson(rootFile);
  assertNoDeprecatedReferences(rootPackage, "root package.json");
  const packageEntries = [];

  for (const entry of PACKAGES) {
    const file = path.join(root, entry.dir, "package.json");
    const pkg = await readJson(file);
    validatePackageName(pkg.name);
    if (pkg.name !== entry.name) {
      throw new ReleaseError(
        `${displayPath(root, file)} is ${pkg.name}, expected ${entry.name}`,
      );
    }
    assertNoDeprecatedReferences(pkg, pkg.name);
    validateJournalExports(pkg);
    packageEntries.push({ file, pkg, original: structuredClone(pkg) });
  }

  if (!existsSync(lockFile)) throw new ReleaseError("bun.lock is missing; cannot synchronize it");
  const lockText = await readText(lockFile);
  const nextLockText = updateLockText(lockText, target);

  const changes = [];
  if (rootPackage.version !== target) {
    changes.push(`package.json version: ${rootPackage.version} -> ${target}`);
    rootPackage.version = target;
  }
  const rootDependencyChanges = updateInternalDependencies(rootPackage, target);
  changes.push(...rootDependencyChanges.map((change) => `package.json ${change}`));

  for (const { file, pkg, original } of packageEntries) {
    const label = displayPath(root, file);
    if (pkg.version !== target) {
      changes.push(`${label} version: ${pkg.version} -> ${target}`);
      pkg.version = target;
    }
    const dependencyChanges = updateInternalDependencies(pkg, target);
    changes.push(...dependencyChanges.map((change) => `${label} ${change}`));
    if (pkg.name !== original.name || JSON.stringify(pkg.bin) !== JSON.stringify(original.bin)) {
      throw new ReleaseError(`${label} name/bin changed unexpectedly; refusing to continue`);
    }
  }
  if (nextLockText !== lockText) {
    changes.push("bun.lock workspace versions and @nones pins updated");
  }

  if (!write) {
    log.info(`version ${target} (dry run; pass --write to apply)`);
    if (changes.length === 0) log.info("already synchronized");
    else for (const change of changes) log.info(`- ${change}`);
    return { written: false, version: target, changes };
  }

  if (changes.length === 0) {
    await validateManifests({ root, version: target });
    await validateLock(root, target);
    log.info(`version ${target}: already synchronized`);
    return { written: false, version: target, changes: [] };
  }

  if (rootPackage.version !== target || rootDependencyChanges.length > 0) {
    await atomicWrite(rootFile, formatJson(rootPackage));
  }
  for (const { file, pkg } of packageEntries) {
    if (JSON.stringify(pkg) !== JSON.stringify(await readJson(file))) {
      await atomicWrite(file, formatJson(pkg));
    }
  }
  if (nextLockText !== lockText) await atomicWrite(lockFile, nextLockText);

  await validateManifests({ root, version: target });
  await validateLock(root, target);
  log.info(`version ${target}: wrote ${changes.length} synchronized change(s)`);
  for (const change of changes) log.info(`- ${change}`);
  return { written: true, version: target, changes };
}
