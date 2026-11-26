import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_REGISTRY, PACKAGES } from "./constants.mjs";
import { ReleaseError } from "./errors.mjs";
import { atomicWrite, formatJson, readJson } from "./io.mjs";
import { validateManifests } from "./manifests.mjs";
import { createLogger, defaultExec } from "./runner.mjs";
import { tarballName, tagToVersion } from "./semver.mjs";
import { verifyInstall } from "./install.mjs";

const PACKAGE_BY_NAME = new Map(PACKAGES.map((entry) => [entry.name, entry]));

function parsePackReport(stdout) {
  let reports;
  try {
    reports = JSON.parse(stdout);
  } catch (error) {
    throw new ReleaseError(`npm pack did not return JSON: ${error.message}`);
  }
  if (!Array.isArray(reports) || reports.length === 0) {
    throw new ReleaseError("npm pack returned no package report");
  }
  return reports[0];
}

/**
 * Entry files a consumer can reach through package.json: main, types and every
 * string leaf of exports (public subpaths such as ./sqlite). Hardcoding
 * dist/index.* breaks packages that only publish an adapter subpath.
 */
export function declaredEntryPaths(pkg) {
  const paths = new Set();
  const add = (value) => {
    if (typeof value === "string" && value.length > 0) paths.add(value.replace(/^\.\//, ""));
  };
  const visit = (value) => {
    if (typeof value === "string") add(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") for (const nested of Object.values(value)) visit(nested);
  };
  add(pkg.main);
  add(pkg.types);
  visit(pkg.exports);
  if (paths.size === 0) {
    throw new ReleaseError(`${pkg.name} declares no main, types or exports entry paths`);
  }
  return [...paths].sort();
}

function assertPackedFiles(entry, pkg, report) {
  const paths = new Set((report.files ?? []).map((file) => file.path));
  for (const required of declaredEntryPaths(pkg)) {
    if (!paths.has(required)) {
      throw new ReleaseError(`${entry.name} tarball is missing declared entry ${required}`);
    }
  }
  for (const file of paths) {
    if (file.startsWith("src/") || file.includes("/src/")) {
      throw new ReleaseError(`${entry.name} tarball leaks source file ${file}`);
    }
  }
  for (const [bin, target] of Object.entries(pkg.bin ?? {})) {
    const packedPath = String(target).replace(/^\.\//, "");
    if (!paths.has(packedPath)) {
      throw new ReleaseError(`${entry.name} tarball is missing bin ${bin} (${packedPath})`);
    }
  }
}

async function resolveCommit({ root, commit, skipCommit, exec }) {
  if (skipCommit) return null;
  const value = commit ?? (await exec("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(value)) {
    throw new ReleaseError("Release commit must be a full Git commit SHA");
  }
  return value;
}

export async function packRelease({
  root,
  tag,
  outDir,
  commit,
  skipCommit = false,
  installSmoke = true,
  registry = DEFAULT_REGISTRY,
  exec = defaultExec,
  logger,
} = {}) {
  const log = createLogger(logger);
  const parsed = tagToVersion(tag);
  const validated = await validateManifests({ root, version: parsed.version });
  const destination = path.resolve(root, outDir ?? path.join(".tmp", "release", parsed.tag));
  const sourceCommit = await resolveCommit({ root, commit, skipCommit, exec });
  // npm pack writes the tarball itself and fails with ENOENT when the
  // --pack-destination parent does not exist yet.
  await mkdir(destination, { recursive: true });

  const packages = [];
  for (const entry of validated.packages) {
    const spec = PACKAGE_BY_NAME.get(entry.name);
    const directory = path.join(root, spec.dir);
    const pkg = await readJson(path.join(directory, "package.json"));
    const expected = tarballName(entry.name, parsed.version);
    const result = await exec(
      "npm",
      [
        "pack",
        "--ignore-scripts",
        "--json",
        "--pack-destination",
        destination,
        "--registry",
        registry,
      ],
      { cwd: directory },
    );
    const report = parsePackReport(result.stdout);
    const filename = path.basename(report.filename ?? expected);
    if (filename !== expected) {
      throw new ReleaseError(`${entry.name} packed as ${filename}, expected ${expected}`);
    }
    assertPackedFiles(entry, pkg, report);
    const tarball = path.join(destination, filename);
    const contents = await readFile(tarball);
    const sha256 = createHash("sha256").update(contents).digest("hex");
    packages.push({
      name: entry.name,
      dir: entry.dir,
      version: parsed.version,
      tarball: filename,
      sha256,
      size: contents.length,
    });
    log.info(`packed ${entry.name}@${parsed.version}: ${filename} (${contents.length} bytes)`);
  }

  const manifest = { schema: 1, tag: parsed.tag, version: parsed.version, packages };
  await atomicWrite(path.join(destination, "release-manifest.json"), formatJson(manifest));
  const checksums = `${packages
    .map((entry) => `${entry.sha256}  ${entry.tarball}`)
    .join("\n")}\n`;
  await atomicWrite(path.join(destination, "SHA256SUMS"), checksums);
  if (sourceCommit) {
    await atomicWrite(path.join(destination, "release-commit.txt"), `${sourceCommit}\n`);
  }
  log.info(`wrote ${path.join(destination, "release-manifest.json")}`);

  if (installSmoke) {
    await verifyInstall({ root, outDir: destination, manifest, registry, exec, logger });
  }
  return { ...manifest, outDir: destination, commit: sourceCommit };
}
