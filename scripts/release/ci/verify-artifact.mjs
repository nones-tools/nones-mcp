#!/usr/bin/env node
/**
 * Verifies one downloaded release artifact directory against its own manifest.
 *
 * The expected tarball set is read from `release-manifest.json`, so the check
 * follows the actual release (four or five packages) instead of a hardcoded
 * roster. Extra or unlisted files fail closed, as do tag/commit drift and any
 * sha256 mismatch.
 *
 * Usage: verify-artifact.mjs <directory> <tag> <commit>
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { SEMVER_PATTERN, versionToTag } from "../semver.mjs";

const [directory, tag, expected] = process.argv.slice(2);
if (!directory || !tag || !expected) {
  console.error("usage: verify-artifact.mjs <directory> <tag> <commit>");
  process.exit(2);
}

function fail(message) {
  console.error(`verify-artifact: ${message}`);
  process.exit(1);
}

function readText(file) {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    fail(`cannot read ${file}: ${error.message}`);
  }
}

const root = path.resolve(directory);
const commit = readText(path.join(root, "release-commit.txt")).trim();
if (commit !== expected) {
  fail(`release-commit.txt is ${commit}, expected ${expected}`);
}

let tagCommit;
try {
  tagCommit = execFileSync("git", ["rev-parse", `${tag}^{commit}`], {
    encoding: "utf8",
  }).trim();
} catch (error) {
  fail(`cannot resolve tag ${tag}: ${error.message}`);
}
if (tagCommit !== expected) {
  fail(`${tag} points to ${tagCommit}, expected ${expected}`);
}

let manifest;
try {
  manifest = JSON.parse(readText(path.join(root, "release-manifest.json")));
} catch (error) {
  fail(`release-manifest.json is not valid JSON: ${error.message}`);
}
if (manifest?.schema !== 1) fail("release-manifest.json has an unsupported schema");
if (manifest.tag !== tag) {
  fail(`release-manifest.json tag is ${JSON.stringify(manifest.tag)}, expected ${tag}`);
}
if (typeof manifest.version !== "string" || !SEMVER_PATTERN.test(manifest.version)) {
  fail("release-manifest.json has an invalid version");
}
if (versionToTag(manifest.version) !== tag) {
  fail(`release-manifest.json version ${manifest.version} does not match ${tag}`);
}
if (!Array.isArray(manifest.packages) || manifest.packages.length === 0) {
  fail("release-manifest.json declares no packages");
}

const names = new Set();
const tarballs = new Set();
for (const entry of manifest.packages) {
  if (typeof entry?.name !== "string" || entry.name.length === 0) {
    fail("release-manifest.json has a package without a name");
  }
  if (names.has(entry.name)) fail(`release-manifest.json repeats ${entry.name}`);
  names.add(entry.name);

  const tarball = entry.tarball;
  if (
    typeof tarball !== "string" ||
    path.basename(tarball) !== tarball ||
    !tarball.endsWith(".tgz")
  ) {
    fail(`${entry.name} has an invalid tarball name ${JSON.stringify(tarball)}`);
  }
  if (tarballs.has(tarball)) fail(`release-manifest.json repeats ${tarball}`);
  tarballs.add(tarball);

  if (typeof entry.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(entry.sha256)) {
    fail(`${entry.name} has an invalid sha256`);
  }
  const file = path.join(root, tarball);
  let contents;
  try {
    contents = readFileSync(file);
  } catch (error) {
    fail(`missing tarball ${tarball}: ${error.message}`);
  }
  const actual = createHash("sha256").update(contents).digest("hex");
  if (actual !== entry.sha256) {
    fail(`${tarball} sha256 is ${actual}, expected ${entry.sha256}`);
  }
  if (entry.size !== undefined && entry.size !== contents.length) {
    fail(`${tarball} size is ${contents.length}, expected ${entry.size}`);
  }
}

const allowed = new Set(["release-manifest.json", "SHA256SUMS", "release-commit.txt", ...tarballs]);
const packed = [];
for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (!allowed.has(entry.name)) {
    fail(`artifact contains an unexpected entry ${entry.name}`);
  }
  if (!entry.isFile()) {
    fail(`artifact entry ${entry.name} is not a file`);
  }
  if (entry.name.endsWith(".tgz")) packed.push(entry.name);
}
if (packed.length !== tarballs.size) {
  fail(`artifact has ${packed.length} tarballs, manifest declares ${tarballs.size}`);
}
for (const tarball of tarballs) {
  if (!packed.includes(tarball)) fail(`artifact is missing ${tarball}`);
}

const expectedSums = `${manifest.packages
  .map((entry) => `${entry.sha256}  ${entry.tarball}`)
  .join("\n")}\n`;
const sums = readText(path.join(root, "SHA256SUMS"));
if (sums !== expectedSums) {
  fail("SHA256SUMS does not match release-manifest.json");
}

console.log(
  `verify-artifact: ${tag} (${manifest.packages.length} tarballs) commit ${expected} verified`,
);
