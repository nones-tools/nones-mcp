import assert from "node:assert/strict";
import path from "node:path";
import { PACKAGES } from "./constants.mjs";
import { tarballIntegrity } from "./artifact-manifest.mjs";

function notFound() {
  const error = new Error("npm error code E404\nnpm error 404 Not Found");
  error.stderr = error.message;
  return error;
}

function conflict() {
  const error = new Error(
    "npm error code EPUBLISHCONFLICT\nnpm error cannot publish over the previously published versions",
  );
  error.stderr = error.message;
  return error;
}

export function parseSpecifier(specifier) {
  const index = specifier.lastIndexOf("@");
  return { name: specifier.slice(0, index), version: specifier.slice(index + 1) };
}

export function npmMock({ published = {}, latest = {}, integrities = {}, hooks = {} } = {}) {
  const registry = new Map();
  const tags = new Map();
  for (const name of Object.keys(published)) {
    registry.set(name, new Set(published[name]));
    tags.set(name, {});
  }
  for (const [name, version] of Object.entries(latest)) {
    tags.set(name, { ...(tags.get(name) ?? {}), latest: version });
  }
  for (const entry of PACKAGES) {
    if (!registry.has(entry.name)) registry.set(entry.name, new Set());
    if (!tags.has(entry.name)) tags.set(entry.name, {});
  }

  const integrityFor = async (name, version) => {
    const override = integrities[name]?.[version];
    if (override !== undefined) return override;
    const entry = hooks.manifest?.packages.find((candidate) => candidate.name === name);
    if (entry?.version === version && hooks.manifest.outDir) {
      return tarballIntegrity(path.join(hooks.manifest.outDir, entry.tarball));
    }
    return null;
  };

  const calls = [];
  const exec = async (command, args, options = {}) => {
    calls.push({ command, args: [...args], cwd: options.cwd });
    assert.equal(command, "npm");
    const [subcommand] = args;
    if (subcommand === "view") {
      const target = args[1];
      const field = args[2];
      if (field === "dist-tags") {
        const value = tags.get(target);
        if (!value) throw notFound();
        return { stdout: JSON.stringify(value), stderr: "", code: 0 };
      }
      if (field === "version") {
        const { name, version } = parseSpecifier(target);
        if (!registry.get(name)?.has(version)) throw notFound();
        return { stdout: JSON.stringify(version), stderr: "", code: 0 };
      }
      if (field === "dist.integrity") {
        const { name, version } = parseSpecifier(target);
        if (!registry.get(name)?.has(version)) throw notFound();
        return { stdout: JSON.stringify(await integrityFor(name, version)), stderr: "", code: 0 };
      }
    }
    if (subcommand === "publish") {
      const filename = path.basename(args[1]);
      const entry = hooks.manifest.packages.find((candidate) => candidate.tarball === filename);
      if (hooks.failPublish === entry.name) throw new Error(`publish failed for ${entry.name}`);
      if (hooks.conflictPublish === entry.name) {
        registry.get(entry.name).add(entry.version);
        throw conflict();
      }
      registry.get(entry.name).add(entry.version);
      tags.get(entry.name)[args[args.indexOf("--tag") + 1]] = entry.version;
      hooks.onPublish?.(entry, args);
      return { stdout: "", stderr: "", code: 0 };
    }
    if (subcommand === "dist-tag") {
      const { name, version } = parseSpecifier(args[2]);
      const tag = args[3];
      if (hooks.failDistTag === tag) {
        const error = new Error("npm error code E403\nnpm error 403 Forbidden");
        error.stderr = error.message;
        throw error;
      }
      registry.get(name).add(version);
      tags.get(name)[tag] = version;
      return { stdout: "", stderr: "", code: 0 };
    }
    throw new Error(`unexpected npm command: ${args.join(" ")}`);
  };
  return { exec, calls, registry, tags };
}
