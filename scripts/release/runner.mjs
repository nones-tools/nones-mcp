import { execFile } from "node:child_process";
import { ReleaseError } from "./errors.mjs";

export function sanitizeOutput(value) {
  return String(value ?? "")
    .replace(/((?:\/\/[^:\s]+\/:_authToken=)|(?:NODE_AUTH_TOKEN=)|(?:NPM_TOKEN=))[^\s]+/gi, "$1***")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer ***");
}

export class CommandError extends ReleaseError {
  constructor(command, args, result) {
    const detail = sanitizeOutput(result.stderr || result.stdout).trim();
    super(
      `Command failed (${result.code ?? "error"}): ${command} ${args.join(" ")}${
        detail ? `\n${detail}` : ""
      }`,
    );
    this.name = "CommandError";
    this.command = command;
    this.args = args;
    this.code = result.code;
  }
}

export function defaultExec(command, args, options = {}) {
  const environment = {
    ...process.env,
    ...options.env,
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    npm_config_loglevel: "error",
  };
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { cwd: options.cwd, env: environment, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new CommandError(command, args, { code: error.code, stdout, stderr }));
          return;
        }
        resolve({ stdout, stderr, code: 0 });
      },
    );
  });
}

export function createLogger(logger) {
  return {
    info: logger?.info?.bind(logger) ?? ((message) => console.log(message)),
    warn: logger?.warn?.bind(logger) ?? ((message) => console.warn(message)),
  };
}

export function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
