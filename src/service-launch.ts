import { spawn } from "node:child_process";
import { ServiceStartError, sanitizeServiceDetail } from "./service-errors";
import type {
  LaunchResult,
  ServiceEnvironment,
  ServiceLauncher,
} from "./service-types";

const DEFAULT_OUTPUT_LIMIT = 8192;
const DEFAULT_KILL_GRACE_MS = 250;

export interface NativeLauncherOptions {
  outputLimit?: number;
  killGraceMs?: number;
}

function environment(env: ServiceEnvironment): { [name: string]: string } {
  return Object.fromEntries(
    Object.entries(env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

/**
 * Run the native `service start` command with argv only.
 *
 * Concurrent startup serialization is owned by the native OpenCode command;
 * this launcher never adds a second lock, stops a service, or retries.
 */
export function createNativeLauncher(
  options: NativeLauncherOptions = {},
): ServiceLauncher {
  const outputLimit = options.outputLimit ?? DEFAULT_OUTPUT_LIMIT;
  const killGraceMs = options.killGraceMs ?? DEFAULT_KILL_GRACE_MS;
  return (input) =>
    new Promise<LaunchResult>((resolve, reject) => {
      let child: ReturnType<typeof spawn> | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      let hardTimer: ReturnType<typeof setTimeout> | undefined;
      let settled = false;
      let timedOut = false;
      let aborted = false;
      let stdout = "";
      let stderr = "";
      const append = (current: string, chunk: Buffer) =>
        `${current}${chunk.toString()}`.slice(-outputLimit);
      const cleanup = () => {
        clearTimeout(timer);
        clearTimeout(killTimer);
        clearTimeout(hardTimer);
        input.signal?.removeEventListener("abort", onAbort);
      };
      const finish = (code: number | null) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({
          code,
          stdout,
          stderr,
          timedOut,
          aborted,
          pid: child?.pid,
        });
      };
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        const code = (error as NodeJS.ErrnoException)?.code;
        const detail = sanitizeServiceDetail(error);
        reject(
          new ServiceStartError(
            code === "ENOENT" ? "missing-executable" : "native-start-failed",
            code === "ENOENT"
              ? `OpenCode executable not found: ${input.command}`
              : `Could not run OpenCode service start${detail ? `: ${detail}` : ""}`,
            { cause: error },
          ),
        );
      };
      const stop = (reason: "timeout" | "abort") => {
        if (settled) return;
        if (reason === "timeout") timedOut = true;
        else aborted = true;
        try {
          child?.kill("SIGTERM");
        } catch {}
        killTimer = setTimeout(() => {
          try {
            child?.kill("SIGKILL");
          } catch {}
          hardTimer = setTimeout(() => finish(null), killGraceMs);
        }, killGraceMs);
      };
      const onAbort = () => stop("abort");
      try {
        child = spawn(input.command, input.args, {
          shell: false,
          env: environment(input.env),
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        });
      } catch (error) {
        fail(error);
        return;
      }
      child.stdout?.on("data", (chunk: Buffer) => {
        stdout = append(stdout, chunk);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr = append(stderr, chunk);
      });
      child.on("error", fail);
      child.on("close", (code) => finish(code));
      timer = setTimeout(() => stop("timeout"), Math.max(1, input.timeoutMs));
      input.signal?.addEventListener("abort", onAbort, { once: true });
      if (input.signal?.aborted) stop("abort");
    });
}
