/** Reject empty, dot, and separator-bearing values before URL encoding. */
export function isUnsafePathSegment(value: unknown): boolean {
  return (
    !value || value === "." || value === ".." || /[\\/]/.test(String(value))
  );
}
