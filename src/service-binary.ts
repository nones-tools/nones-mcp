import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import { ServiceStartError } from "./service-errors";
import type { ServiceEnvironment } from "./service-types";

async function executable(file: string): Promise<boolean> {
  try {
    const info = await stat(file);
    if (!info.isFile()) return false;
    await access(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function names(candidate: string, env: ServiceEnvironment): string[] {
  if (process.platform !== "win32") return [candidate];
  const extensions = (env.PATHEXT || ".EXE;.CMD;.BAT;.COM")
    .split(";")
    .filter(Boolean);
  const lower = candidate.toLowerCase();
  if (extensions.some((extension) => lower.endsWith(extension.toLowerCase())))
    return [candidate];
  return [
    candidate,
    ...extensions.map((extension) => `${candidate}${extension}`),
  ];
}

function missing(candidate: string): ServiceStartError {
  return new ServiceStartError(
    "missing-executable",
    `OpenCode executable not found: ${candidate}. Install OpenCode 2, pass --opencode-bin, or set OPENCODE_MCP_OPENCODE_BIN.`,
  );
}

/** Resolve an explicit path or a command name against PATH without a shell. */
export async function resolveServiceBinary(
  candidate: string,
  env: ServiceEnvironment = process.env,
): Promise<string> {
  if (candidate.includes("/") || candidate.includes("\\")) {
    const file = path.resolve(process.cwd(), candidate);
    if (await executable(file)) return file;
    throw missing(candidate);
  }
  const directories = (env.PATH || "").split(path.delimiter).filter(Boolean);
  for (const directory of directories)
    for (const name of names(candidate, env)) {
      const file = path.join(directory, name);
      if (await executable(file)) return file;
    }
  throw missing(candidate);
}
