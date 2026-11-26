export type JournalErrorCode =
  "config" | "validation" | "adapter" | "database" | "cursor" | "closed";

/**
 * Stable brand shared by separately built copies of core (source under Bun,
 * packed dist under Node, workspace symlinks). Do not replace with instanceof
 * alone: a trusted adapter may carry its own core class identity.
 */
const JOURNAL_ERROR_BRAND = Symbol.for("@nones/mcp-core.journal-error");

/** Failures carry a stable code so callers can distinguish retryable states. */
export class JournalError extends Error {
  readonly code: JournalErrorCode;
  readonly [JOURNAL_ERROR_BRAND] = true;

  constructor(
    code: JournalErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "JournalError";
    this.code = code;
  }
}

export function isJournalError(value: unknown): value is JournalError {
  if (value instanceof JournalError) return true;
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[JOURNAL_ERROR_BRAND] === true
  );
}
