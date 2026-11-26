/**
 * Ambient utility types shared by runtime modules and tests.
 *
 * These names are intentionally internal: declaration emit does not copy this
 * file, so public signatures use structural types instead.
 */

/** Environment map accepted by runtime helpers and CLI test doubles. */
interface Environment {
  [name: string]: string | undefined;
}

/** A value that may be produced synchronously or asynchronously. */
type MaybePromise<T> = T | Promise<T>;
