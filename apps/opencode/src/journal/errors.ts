export type JournalErrorCode =
  "config" | "validation" | "adapter" | "database" | "cursor" | "closed";

/** Failures carry a stable code so callers can distinguish retryable states. */
export class JournalError extends Error {
  readonly code: JournalErrorCode;

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
