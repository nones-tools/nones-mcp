export type ServiceStartErrorCode =
  | "canceled"
  | "invalid-timeout"
  | "missing-executable"
  | "native-start-failed"
  | "native-start-timeout"
  | "mcp-timeout";

/** Startup failure with a stable category and a credential-free message. */
export class ServiceStartError extends Error {
  readonly code: ServiceStartErrorCode;

  constructor(
    code: ServiceStartErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ServiceStartError";
    this.code = code;
  }
}

export function canceledError(signal?: AbortSignal): ServiceStartError {
  return new ServiceStartError(
    "canceled",
    "OpenCode service startup canceled",
    { cause: signal?.reason },
  );
}

const ansi = new RegExp(
  `${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`,
  "g",
);
const secret =
  /([A-Za-z0-9_]*(?:PASSWORD|PASSWD|TOKEN|SECRET|API[_-]?KEY|CREDENTIAL)[A-Za-z0-9_]*)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi;

/** Bound and redact diagnostic text before it reaches an error message. */
export function sanitizeServiceDetail(
  value: unknown,
  limit = 800,
): string | undefined {
  let text =
    value instanceof Error
      ? value.message
      : typeof value === "string"
        ? value
        : value === undefined
          ? ""
          : String(value);
  text = text.replace(ansi, "");
  text = text.replace(/([a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/gi, "$1[redacted]@");
  text = text.replace(secret, "$1=[redacted]");
  text = text.replace(
    /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi,
    "$1 [redacted]",
  );
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.length > limit
    ? `${text.slice(0, Math.max(0, limit - 1))}…`
    : text;
}
