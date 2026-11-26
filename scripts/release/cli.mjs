import path from "node:path";
import { DEFAULT_REGISTRY, DEFAULT_ROOT, DEFAULT_STAGING_DIST_TAG } from "./constants.mjs";
import { ReleaseError } from "./errors.mjs";
import { readReleaseManifest } from "./artifact-manifest.mjs";
import { verifyTag } from "./git.mjs";
import { verifyInstall } from "./install.mjs";
import { packRelease } from "./pack.mjs";
import { planRelease } from "./plan.mjs";
import { publishRelease } from "./publish.mjs";
import { createLogger } from "./runner.mjs";
import { versionCommand } from "./version.mjs";

export function usage() {
  return `Usage:
  release.mjs version <X.Y.Z> [--write] [--root <dir>]
  release.mjs plan --tag <vX.Y.Z> [--dist-tag <tag>] [--check-registry] [--json]
  release.mjs verify-tag --tag <vX.Y.Z> [--main-ref origin/main] [--commit <sha>] [--skip-ancestry]
  release.mjs pack --tag <vX.Y.Z> [--out <dir>] [--commit <sha>] [--skip-install-smoke]
  release.mjs verify-install --out <dir>
  release.mjs publish --tag <vX.Y.Z> [--out <dir>] [--dist-tag staging] [--write] [--provenance] [--no-latest]

Mutating release commands are dry-runs unless --write is passed.
--no-latest publishes only the staging dist-tag (first-publish/bootstrap runs).
`;
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function parseArguments(argv) {
  const positional = [];
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      positional.push(argument);
      continue;
    }
    const equals = argument.indexOf("=");
    if (equals > 2) {
      options[toCamel(argument.slice(2, equals))] = argument.slice(equals + 1);
      continue;
    }
    const name = toCamel(argument.slice(2));
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      options[name] = next;
      index += 1;
    } else {
      options[name] = true;
    }
  }
  return { positional, options };
}

function resolveTag(options, positional) {
  return options.tag ?? positional[0];
}

export async function main(argv = process.argv.slice(2), logger = console) {
  const { positional, options } = parseArguments(argv);
  const command = positional.shift();
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const log = createLogger(logger);
  const registry = options.registry ?? DEFAULT_REGISTRY;

  if (!command || command === "help" || options.help) {
    log.info(usage());
    return { help: true };
  }
  if (command === "version") {
    const version = options.version ?? positional[0];
    if (!version) throw new ReleaseError("version requires X.Y.Z");
    return versionCommand({ root, version, write: options.write === true, logger });
  }
  if (command === "plan") {
    const tag = resolveTag(options, positional);
    if (!tag) throw new ReleaseError("plan requires --tag vX.Y.Z");
    const plan = await planRelease({
      root,
      tag,
      distTag: options.distTag ?? DEFAULT_STAGING_DIST_TAG,
      checkRegistry: options.checkRegistry === true,
      registry,
      logger: options.json ? { info() {}, warn() {} } : logger,
    });
    if (options.json) process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return plan;
  }
  if (command === "verify-tag") {
    const tag = resolveTag(options, positional);
    if (!tag) throw new ReleaseError("verify-tag requires --tag vX.Y.Z");
    return verifyTag({
      root,
      tag,
      commit: options.commit,
      mainRef: options.mainRef ?? "origin/main",
      skipAncestry: options.skipAncestry === true,
      logger,
    });
  }
  if (command === "pack") {
    const tag = resolveTag(options, positional);
    if (!tag) throw new ReleaseError("pack requires --tag vX.Y.Z");
    return packRelease({
      root,
      tag,
      outDir: options.out,
      commit: options.commit,
      skipCommit: options.skipCommit === true,
      installSmoke: options.skipInstallSmoke !== true,
      registry,
      logger,
    });
  }
  if (command === "verify-install") {
    if (!options.out) throw new ReleaseError("verify-install requires --out <dir>");
    const manifest = await readReleaseManifest({ root, outDir: options.out });
    return verifyInstall({ root, outDir: options.out, manifest, registry, logger });
  }
  if (command === "publish") {
    const tag = resolveTag(options, positional);
    if (!tag) throw new ReleaseError("publish requires --tag vX.Y.Z");
    return publishRelease({
      root,
      tag,
      outDir: options.out,
      distTag: options.distTag ?? DEFAULT_STAGING_DIST_TAG,
      promoteLatest: options.noLatest !== true,
      write: options.write === true,
      provenance: options.provenance === true,
      registry,
      mainRef: options.mainRef ?? "origin/main",
      skipAncestry: options.skipAncestry === true,
      logger,
    });
  }
  throw new ReleaseError(`Unknown command ${JSON.stringify(command)}\n${usage()}`);
}
