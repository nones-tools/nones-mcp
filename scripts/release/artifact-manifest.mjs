import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PACKAGES } from "./constants.mjs";
import { ReleaseError } from "./errors.mjs";
import { readJson, readText } from "./io.mjs";
import { SEMVER_PATTERN, tarballName, versionToTag } from "./semver.mjs";

export async function readReleaseManifest({ root, outDir }) {
  const destination = path.resolve(root, outDir);
  const file = path.join(destination, "release-manifest.json");
  const manifest = await readJson(file);
  if (manifest.schema !== 1) throw new ReleaseError(`${file} has an unsupported schema`);
  if (!Array.isArray(manifest.packages) || manifest.packages.length !== PACKAGES.length) {
    throw new ReleaseError(`${file} must describe all ${PACKAGES.length} packages`);
  }

  const byName = new Map();
  for (const entry of manifest.packages) {
    if (byName.has(entry.name)) throw new ReleaseError(`${file} repeats ${entry.name}`);
    byName.set(entry.name, entry);
    const expected = tarballName(entry.name, manifest.version);
    if (entry.tarball !== expected) {
      throw new ReleaseError(`${entry.name} tarball is ${entry.tarball}, expected ${expected}`);
    }
    const tarball = path.join(destination, entry.tarball);
    if (!existsSync(tarball)) throw new ReleaseError(`missing packed tarball ${tarball}`);
    const contents = await readFile(tarball);
    const sha256 = createHash("sha256").update(contents).digest("hex");
    if (sha256 !== entry.sha256) {
      throw new ReleaseError(`${entry.tarball} does not match the recorded sha256`);
    }
  }
  for (const entry of PACKAGES) {
    if (!byName.has(entry.name)) throw new ReleaseError(`${file} is missing ${entry.name}`);
  }

  const checksumFile = path.join(destination, "SHA256SUMS");
  if (existsSync(checksumFile)) {
    const expected = `${manifest.packages
      .map((entry) => `${entry.sha256}  ${entry.tarball}`)
      .join("\n")}\n`;
    if ((await readText(checksumFile)) !== expected) {
      throw new ReleaseError(`${checksumFile} does not match the release manifest`);
    }
  }
  if (!SEMVER_PATTERN.test(manifest.version ?? "")) {
    throw new ReleaseError(`${file} has an invalid version`);
  }
  if (manifest.tag !== versionToTag(manifest.version)) {
    throw new ReleaseError(`${file} tag does not match version ${manifest.version}`);
  }
  return { ...manifest, outDir: destination };
}

export async function readArtifactCommit(outDir) {
  const file = path.join(outDir, "release-commit.txt");
  if (!existsSync(file)) {
    throw new ReleaseError(
      `verified artifact is missing ${file}; pack or download the named release artifact first`,
    );
  }
  const commit = (await readText(file)).trim();
  if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(commit)) {
    throw new ReleaseError(`${file} does not contain a Git commit SHA`);
  }
  return commit;
}
