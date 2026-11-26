import { canceledError } from "./service-errors";
import type { ServiceClock } from "./service-types";

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw canceledError(signal);
}

export const systemClock: ServiceClock = {
  now: () => Date.now(),
  sleep(milliseconds, signal) {
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(canceledError(signal));
        return;
      }
      const timer = setTimeout(done, Math.max(0, milliseconds));
      const onAbort = () => {
        clearTimeout(timer);
        reject(canceledError(signal));
      };
      function done() {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  },
};

export interface InterruptSignal {
  signal: AbortSignal;
  dispose(): void;
}

/** Bind SIGINT to cancellation without stopping any managed daemon. */
export function interruptSignal(signal?: AbortSignal): InterruptSignal {
  if (signal) return { signal, dispose() {} };
  const controller = new AbortController();
  const onInterrupt = () => controller.abort();
  process.once("SIGINT", onInterrupt);
  return {
    signal: controller.signal,
    dispose: () => process.off("SIGINT", onInterrupt),
  };
}
