import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
export const coreBin = path.join(repoRoot, "apps", "core", "dist", "bin.js");

export interface Sandbox {
  root: string;
  home: string;
  xdg: string;
  configDir: string;
  write(relative: string, value: unknown): Promise<void>;
}

/** Scratch space stays inside the repository under ignored .tmp/. */
export async function makeSandbox(): Promise<Sandbox> {
  const parent = path.join(repoRoot, ".tmp", "tests");
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, "run-"));
  const home = path.join(root, "home");
  const xdg = path.join(root, "xdg");
  const configDir = path.join(xdg, "nones");
  await mkdir(home, { recursive: true });
  await mkdir(configDir, { recursive: true });
  return {
    root,
    home,
    xdg,
    configDir,
    async write(relative, value) {
      const file = path.join(configDir, relative);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
    },
  };
}

/** Minimal, non-mutating environment for spawned children. */
export function childEnvironment(
  sandbox: Sandbox,
  extra: Record<string, string>,
): Record<string, string> {
  return {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: sandbox.home,
    XDG_CONFIG_HOME: sandbox.xdg,
    NONES_CONFIG_DIR: sandbox.configDir,
    TMPDIR: sandbox.root,
    LANG: "C",
    ...extra,
  };
}
