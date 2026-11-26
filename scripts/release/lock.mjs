import { existsSync } from "node:fs";
import path from "node:path";
import {
  DEPRECATED_PACKAGE_NAMES,
  PACKAGES,
  PACKAGE_NAMES,
} from "./constants.mjs";
import { ReleaseError } from "./errors.mjs";
import { findObjectBlock, readText } from "./io.mjs";
import { normalizeVersion } from "./semver.mjs";

const INTERNAL_NAME_PATTERN = PACKAGE_NAMES.map(escapeRegExp).join("|");
const INTERNAL_DEPENDENCY = new RegExp(
  `("(?:${INTERNAL_NAME_PATTERN})"\\s*:\\s*")([^"]*)(")`,
  "g",
);

export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceInternalDependencyVersions(text, version) {
  return text.replace(INTERNAL_DEPENDENCY, (_match, prefix, _old, suffix) => {
    return `${prefix}${version}${suffix}`;
  });
}

function internalDependencyVersions(text) {
  const versions = [];
  for (const match of text.matchAll(INTERNAL_DEPENDENCY)) versions.push(match[2]);
  return versions;
}

export function updateLockText(lockText, version) {
  const target = normalizeVersion(version);
  const workspaces = findObjectBlock(lockText, "workspaces");
  const sectionStart = workspaces.open + 1;
  const sectionEnd = workspaces.end - 1;
  let section = lockText.slice(sectionStart, sectionEnd);

  for (const entry of PACKAGES) {
    const block = findObjectBlock(section, entry.dir);
    let blockText = block.text;
    blockText = blockText.replace(
      /("version"\s*:\s*")([^"]*)(")/,
      (_match, prefix, _old, suffix) => `${prefix}${target}${suffix}`,
    );
    blockText = replaceInternalDependencyVersions(blockText, target);
    section = `${section.slice(0, block.start)}${blockText}${section.slice(block.end)}`;
  }

  const rootBlock = findObjectBlock(section, "");
  const rootText = replaceInternalDependencyVersions(rootBlock.text, target);
  section = `${section.slice(0, rootBlock.start)}${rootText}${section.slice(rootBlock.end)}`;

  return `${lockText.slice(0, sectionStart)}${section}${lockText.slice(sectionEnd)}`;
}

export async function validateLock(root, version) {
  const target = normalizeVersion(version);
  const file = path.join(root, "bun.lock");
  if (!existsSync(file)) throw new ReleaseError("bun.lock is missing; commit the root Bun lock");
  const lockText = await readText(file);
  for (const deprecated of DEPRECATED_PACKAGE_NAMES) {
    if (lockText.includes(deprecated)) {
      throw new ReleaseError(
        `bun.lock still references retired package ${deprecated}; run the journal migration first`,
      );
    }
  }
  const workspaces = findObjectBlock(lockText, "workspaces");
  const section = lockText.slice(workspaces.open + 1, workspaces.end - 1);

  for (const entry of PACKAGES) {
    const block = findObjectBlock(section, entry.dir);
    if (!block.text.includes(`"name": ${JSON.stringify(entry.name)}`)) {
      throw new ReleaseError(`bun.lock workspace ${entry.dir} has the wrong package name`);
    }
    const lockVersion = /"version"\s*:\s*"([^"]*)"/.exec(block.text)?.[1];
    if (lockVersion !== target) {
      throw new ReleaseError(
        `bun.lock workspace ${entry.dir} version ${lockVersion} does not match ${target}`,
      );
    }
    const versions = internalDependencyVersions(block.text);
    if (versions.some((value) => value !== target)) {
      throw new ReleaseError(
        `bun.lock workspace ${entry.dir} has non-exact @nones dependency versions`,
      );
    }
  }

  const rootBlock = findObjectBlock(section, "");
  const rootVersions = internalDependencyVersions(rootBlock.text);
  if (rootVersions.some((value) => value !== target)) {
    throw new ReleaseError("bun.lock root workspace has non-exact @nones dependency versions");
  }
  return true;
}
