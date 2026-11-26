import { KaitenApiError, KaitenTimeoutError } from './errors';

/**
 * Runs a single fetch attempt with a hard time budget. On timeout, aborts
 * the in-flight request via `AbortController` and throws `KaitenTimeoutError`
 * naming `KAITEN_HTTP_TIMEOUT_MS`, the configured limit, and the method+path
 * that timed out. The timer is cleared once the attempt settles (`finally`)
 * and `unref`'d so a pending timeout never keeps the process alive.
 */
export async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  method: string,
  path: string
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  (timer as unknown as { unref?: () => void }).unref?.();
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) throw new KaitenTimeoutError(timeoutMs, method, path);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * True for transient failures worth retrying on a GET: network-level fetch
 * failures (a thrown `TypeError`, per the fetch spec) and upstream 5xx
 * responses surfaced as `KaitenApiError`. Client errors (4xx) and anything
 * else are never retried.
 */
export function isRetriable(error: unknown): boolean {
  if (error instanceof KaitenApiError) return error.status >= 500;
  return error instanceof TypeError;
}

/**
 * Runs `fn` once, then up to `retries` extra times while the failure is
 * `isRetriable` - a simple immediate retry, no backoff (constitution I:
 * small, predictable, testable). `retries <= 0` behaves exactly like calling
 * `fn()` once - callers don't need to branch on whether retries are configured.
 */
export async function withRetries<T>(fn: () => Promise<T>, retries: number): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !isRetriable(err)) throw err;
      attempt++;
    }
  }
}
