import { resolveServiceBinary } from "./service-binary";
import { interruptSignal, systemClock, throwIfAborted } from "./service-clock";
import { canceledError, ServiceStartError } from "./service-errors";
import { createNativeLauncher } from "./service-launch";
import {
  DEFAULT_PROBE_ATTEMPT_MS,
  DEFAULT_PROBE_INTERVAL_MS,
  oneProbe,
  waitForReadiness,
} from "./service-readiness";
import type {
  ProbeReady,
  StartServiceOptions,
  StartServiceResult,
} from "./service-types";

export const DEFAULT_SERVICE_TIMEOUT_SECONDS = 30;
const DEFAULT_LAUNCH_ATTEMPT_MS = 15000;

function detailSuffix(detail?: string): string {
  return detail ? ` Details: ${detail}` : "";
}

function seconds(milliseconds: number): string {
  return Number((milliseconds / 1000).toFixed(1)).toString();
}

function timeoutMilliseconds(
  value: number | string = DEFAULT_SERVICE_TIMEOUT_SECONDS,
): number {
  const seconds = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(seconds) || seconds <= 0)
    throw new ServiceStartError(
      "invalid-timeout",
      "--timeout must be a positive number of seconds",
    );
  return Math.round(seconds * 1000);
}

function mcpTimeout(
  timeoutMs: number,
  phase: string,
  detail?: string,
): ServiceStartError {
  return new ServiceStartError(
    "mcp-timeout",
    `OpenCode MCP readiness timed out after ${seconds(timeoutMs)}s ${phase}.${detailSuffix(detail)}`,
  );
}

function readyResult(
  source: StartServiceResult["source"],
  nativeStartRequested: boolean,
  ready: ProbeReady,
): StartServiceResult {
  return {
    status: "ready",
    source,
    nativeStartRequested,
    mcpVersion: ready.mcpVersion,
    ...(ready.serverName ? { serverName: ready.serverName } : {}),
    ...(ready.protocolVersion
      ? { protocolVersion: ready.protocolVersion }
      : {}),
    readiness: ready.method,
  };
}

/**
 * Prove or start the OpenCode service for the explicit `server start` command.
 *
 * Managed discovery launches only `opencode2 service start`; explicit URL or
 * service-file configuration is observed and never spawned. Nothing here stops
 * or replaces a service, and no credential values enter argv or diagnostics.
 */
export async function startService(
  options: StartServiceOptions,
): Promise<StartServiceResult> {
  const interrupt = interruptSignal(options.signal);
  try {
    return await runServiceStart(options, interrupt.signal);
  } finally {
    interrupt.dispose();
  }
}

async function runServiceStart(
  options: StartServiceOptions,
  signal: AbortSignal,
): Promise<StartServiceResult> {
  const env = options.env ?? process.env;
  const clock = options.clock ?? systemClock;
  const timeoutMs = timeoutMilliseconds(options.timeoutSeconds);
  const deadline = clock.now() + timeoutMs;
  const source =
    env.OPENCODE_MCP_URL || env.OPENCODE_MCP_SERVICE_FILE
      ? "explicit"
      : "managed";
  const attemptMs = options.probeAttemptMs ?? DEFAULT_PROBE_ATTEMPT_MS;
  const intervalMs = options.probeIntervalMs ?? DEFAULT_PROBE_INTERVAL_MS;
  const launcher = options.launcher ?? createNativeLauncher();
  const probeOnce = (timeout: number) =>
    oneProbe(options.probe, env, signal, timeout);
  const wait = () =>
    waitForReadiness({
      clock,
      deadline,
      attemptMs,
      intervalMs,
      signal,
      probe: probeOnce,
    });
  throwIfAborted(signal);

  if (source === "explicit") {
    const found = await wait();
    if (!found.ready)
      throw mcpTimeout(timeoutMs, "at the explicit endpoint", found.detail);
    return readyResult(source, false, found.ready);
  }

  const initial = await probeOnce(
    Math.max(1, Math.min(attemptMs, deadline - clock.now())),
  );
  if (initial.ready) return readyResult(source, false, initial);
  throwIfAborted(signal);

  const binary = await resolveServiceBinary(
    options.opencodeBin || env.OPENCODE_MCP_OPENCODE_BIN || "opencode2",
    env,
  );
  const remaining = deadline - clock.now();
  if (remaining <= 0)
    throw mcpTimeout(timeoutMs, "before native startup", initial.detail);
  const launchTimeout = Math.min(
    options.launchAttemptMs ?? DEFAULT_LAUNCH_ATTEMPT_MS,
    Math.max(1, Math.floor(remaining * 0.6)),
  );
  const launched = await launcher({
    command: binary,
    args: ["service", "start"],
    timeoutMs: launchTimeout,
    signal,
    env,
  });
  if (launched.aborted) throw canceledError(signal);
  if (launched.timedOut) {
    const found = await wait();
    if (found.ready) return readyResult(source, true, found.ready);
    throw new ServiceStartError(
      "native-start-timeout",
      `OpenCode service start timed out after ${seconds(timeoutMs)}s; a daemon may still be starting, so it was not retried.${detailSuffix(found.detail)}`,
    );
  }
  if (launched.code !== 0)
    throw new ServiceStartError(
      "native-start-failed",
      `OpenCode service start exited with code ${launched.code ?? "unknown"}. Run \`opencode2 service status\` or check the OpenCode logs for details.`,
    );

  const found = await wait();
  if (!found.ready)
    throw mcpTimeout(
      timeoutMs,
      "after native startup",
      found.detail ?? initial.detail,
    );
  return readyResult(source, true, found.ready);
}
