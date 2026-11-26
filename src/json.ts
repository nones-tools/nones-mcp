/**
 * User-facing JSON is indented; protocol framing and HTTP bodies use their
 * own serializers so this helper never touches newline-delimited JSON-RPC.
 */
export function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? "null";
}
