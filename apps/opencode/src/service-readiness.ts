import { throwIfAborted } from "./service-clock";
import { canceledError, sanitizeServiceDetail } from "./service-errors";
import type {
  ProbeReady,
  ProbeResult,
  ServiceClock,
  ServiceEnvironment,
  ServiceProbe,
} from "./service-types";

export const DEFAULT_PROBE_ATTEMPT_MS = 2000;
export const DEFAULT_PROBE_INTERVAL_MS = 250;

export interface Readiness {
  ready?: ProbeReady;
  detail?: string;
}

export interface WaitOptions {
  clock: ServiceClock;
  deadline: number;
  attemptMs: number;
  intervalMs: number;
  signal?: AbortSignal;
  probe: (timeoutMs: number) => Promise<ProbeResult>;
}

export async function oneProbe(
  probe: ServiceProbe,
  env: ServiceEnvironment,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<ProbeResult> {
  try {
    const result = await probe({ timeoutMs, signal, env });
    if (result.ready) return result;
    return { ...result, detail: sanitizeServiceDetail(result.detail) };
  } catch (error) {
    if (signal?.aborted) throw canceledError(signal);
    return { ready: false, detail: sanitizeServiceDetail(error) };
  }
}

export async function waitForReadiness(
  options: WaitOptions,
): Promise<Readiness> {
  let detail: string | undefined;
  while (true) {
    throwIfAborted(options.signal);
    const remaining = options.deadline - options.clock.now();
    if (remaining <= 0) return { detail };
    const result = await options.probe(
      Math.max(1, Math.min(options.attemptMs, remaining)),
    );
    if (result.ready) return { ready: result };
    detail = result.detail ?? detail;
    const left = options.deadline - options.clock.now();
    if (left <= 0) return { detail };
    await options.clock.sleep(
      Math.min(options.intervalMs, left),
      options.signal,
    );
  }
}
