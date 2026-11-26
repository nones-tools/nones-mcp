import type { OpenCodeClient } from "./client";
import { resolveJournalConfig } from "@nones/mcp-core";
import { getSession } from "./native-session";

/** A title lookup is optional metadata and must never delay submission. */
export const TITLE_LOOKUP_TIMEOUT_MS = 150;

export async function journalingEnabled(
  env: Record<string, string | undefined>,
): Promise<boolean> {
  try {
    return (await resolveJournalConfig(env)).enabled;
  } catch {
    return false;
  }
}

export async function bestEffortSessionTitle(
  client: OpenCodeClient,
  sessionID: string,
): Promise<string | undefined> {
  try {
    const info = await getSession(
      client,
      sessionID,
      AbortSignal.timeout(TITLE_LOOKUP_TIMEOUT_MS),
    );
    return info.title;
  } catch {
    return undefined;
  }
}

export function errorSessionID(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "sessionID" in error &&
    typeof error.sessionID === "string"
  )
    return error.sessionID;
  return undefined;
}
