import { OpenCodeClient } from "./client";
import { formatJson } from "./json";
import { getSession, type SessionInfo } from "./native-session";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;

export interface MessagesOptions {
  sessionID: string;
  limit?: number;
  cursor?: string;
}

export interface SessionsOptions {
  limit?: number;
}

function boundedLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT)
    throw new Error(`Limit must be an integer from 1 to ${MAX_LIMIT}`);
  return limit;
}

/** Print current native session metadata; the native shape is preserved. */
export async function runStatus(
  sessionID: string,
  env: { [name: string]: string | undefined } = process.env,
): Promise<void> {
  const client = await OpenCodeClient.connect(env);
  console.log(formatJson(await getSession(client, sessionID)));
}

/** Print the latest native messages with the upstream cursor. */
export async function runMessages(
  options: MessagesOptions,
  env: { [name: string]: string | undefined } = process.env,
): Promise<void> {
  const limit = boundedLimit(options.limit);
  const client = await OpenCodeClient.connect(env);
  const query: Record<string, unknown> = { limit };
  if (options.cursor) query.cursor = options.cursor;
  else query.order = "desc";
  const page = await client.request({
    operation: "session.message.list",
    path: { sessionID: options.sessionID },
    query,
  });
  const data = Array.isArray(page?.data) ? page.data : [];
  console.log(
    formatJson({
      sessionID: options.sessionID,
      messages: data,
      cursor: page?.cursor ?? null,
    }),
  );
}

/** Discover native session IDs with a small, bounded projection. */
export async function runSessions(
  options: SessionsOptions,
  env: { [name: string]: string | undefined } = process.env,
): Promise<void> {
  const limit = boundedLimit(options.limit);
  const client = await OpenCodeClient.connect(env);
  const page = await client.request({
    operation: "session.list",
    query: { limit, order: "desc" },
  });
  const sessions: SessionInfo[] = Array.isArray(page?.data) ? page.data : [];
  console.log(
    formatJson({
      sessions: sessions.map((session) => ({
        id: session.id,
        title: session.title ?? null,
        parentID: session.parentID ?? null,
        outcome: session.outcome ?? null,
        directory: session.location?.directory ?? null,
        updated: session.time?.updated ?? null,
      })),
      cursor: page?.cursor ?? null,
    }),
  );
}
