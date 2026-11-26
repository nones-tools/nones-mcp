import { JournalError } from "./errors";
import { MAX_CURSOR_BYTES } from "./limits";

export interface JournalCursor {
  atMs: number;
  id: string;
}

export function encodeCursor(cursor: JournalCursor): string {
  return Buffer.from(JSON.stringify([cursor.atMs, cursor.id]), "utf8").toString(
    "base64url",
  );
}

/** Cursors are opaque and validated; malformed input fails instead of rescanning. */
export function decodeCursor(token: string): JournalCursor {
  if (token.length === 0 || token.length > MAX_CURSOR_BYTES)
    throw new JournalError("cursor", "Invalid journal cursor");
  if (!/^[A-Za-z0-9_-]+$/.test(token))
    throw new JournalError("cursor", "Invalid journal cursor");
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  } catch {
    throw new JournalError("cursor", "Invalid journal cursor");
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 2 ||
    typeof parsed[0] !== "number" ||
    !Number.isInteger(parsed[0]) ||
    typeof parsed[1] !== "string" ||
    parsed[1].length === 0
  )
    throw new JournalError("cursor", "Invalid journal cursor");
  return { atMs: parsed[0], id: parsed[1] };
}
