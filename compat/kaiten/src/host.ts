import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ModuleError,
  ModuleErrorCode,
  type ModuleContext,
  type ModulePermissions,
} from "@nones/mcp-core";

const BASE_ENV = [
  "PATH",
  "HOME",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "TERM",
  "SHELL",
  "SystemRoot",
  "ComSpec",
  "PATHEXT",
  "USERPROFILE",
  "APPDATA",
];

export interface HostPackage {
  name: string;
  version: string;
  /** Absolute path of each requested bin, keyed by bin name. */
  bins: Record<string, string>;
}

/** Resolves the installed host package next to this adapter, never via PATH or CWD. */
export async function resolveHost(
  specifier: string,
  binNames: readonly string[],
): Promise<HostPackage> {
  let entry: string;
  try {
    entry = fileURLToPath(import.meta.resolve(specifier));
  } catch {
    throw new ModuleError(
      ModuleErrorCode.ModuleUnavailable,
      `installed package ${specifier} was not found`,
    );
  }
  const root = path.resolve(path.dirname(entry), "..");
  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
    name?: string;
    version?: string;
    bin?: Record<string, string>;
  };
  if (!pkg.name || !pkg.version) {
    throw new ModuleError(
      ModuleErrorCode.ModuleIncompatible,
      `${specifier} has unreadable package metadata`,
    );
  }
  const bins: Record<string, string> = {};
  for (const binName of binNames) {
    const bin = pkg.bin?.[binName];
    if (!bin) {
      throw new ModuleError(
        ModuleErrorCode.ModuleIncompatible,
        `${specifier} does not expose the ${binName} executable`,
      );
    }
    bins[binName] = path.resolve(root, bin);
  }
  return { name: pkg.name, version: pkg.version, bins };
}

export function assertHostVersion(host: HostPackage, expected: string): void {
  if (host.version !== expected) {
    throw new ModuleError(
      ModuleErrorCode.ModuleIncompatible,
      `${host.name} ${host.version} is installed; this adapter targets ${expected}`,
    );
  }
}

/** Only documented prefix-owned variables plus platform basics reach the child. */
export function childEnv(
  context: ModuleContext,
  extra: Record<string, string>,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of BASE_ENV) {
    const value = process.env[key];
    if (value !== undefined && value !== "") env[key] = value;
  }
  Object.assign(env, context.env, extra);
  return env;
}

export function assertPermissions(
  moduleId: string,
  permissions: ModulePermissions,
  supported: readonly (keyof ModulePermissions)[],
): void {
  for (const key of Object.keys(permissions) as (keyof ModulePermissions)[]) {
    if (permissions[key] && !supported.includes(key)) {
      throw new ModuleError(
        ModuleErrorCode.ConfigInvalid,
        `module ${moduleId} does not support permission ${key}`,
      );
    }
  }
}
