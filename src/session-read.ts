import { OpenCodeClient } from "./client";
import { recordJournaledOperation } from "./journal/cli-action";
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
  const startedAt = Date.now();
  let info: SessionInfo;
  try {
    info = await getSession(client, sessionID);
  } catch (error) {
    await recordJournaledOperation({
      operation: "opencode.session.status",
      sessionId: sessionID,
      outcome: "failure",
      startedAt,
      endedAt: Date.now(),
      env,
    });
    throw error;
  }
  const endedAt = Date.now();
  console.log(formatJson(info));
  await recordJournaledOperation({
    operation: "opencode.session.status",
    sessionId: sessionID,
    sessionTitle: info.title,
    outcome: "success",
    startedAt,
    endedAt,
    env,
  });
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
  const startedAt = Date.now();
  let page: any;
  try {
    page = await client.request({
      operation: "session.message.list",
      path: { sessionID: options.sessionID },
      query,
    });
  } catch (error) {
    await recordJournaledOperation({
      operation: "opencode.session.messages",
      sessionId: options.sessionID,
      outcome: "failure",
      startedAt,
      endedAt: Date.now(),
      env,
    });
    throw error;
  }
  const endedAt = Date.now();
  const data = Array.isArray(page?.data) ? page.data : [];
  console.log(
    formatJson({
      sessionID: options.sessionID,
      messages: data,
      cursor: page?.cursor ?? null,
    }),
  );
  await recordJournaledOperation({
    operation: "opencode.session.messages",
    sessionId: options.sessionID,
    outcome: "success",
    startedAt,
    endedAt,
    env,
  });
}

/** Discover native session IDs with a small, bounded projection. */
export async function runSessions(
  options: SessionsOptions,
  env: { [name: string]: string | undefined } = process.env,
): Promise<void> {
  const limit = boundedLimit(options.limit);
  const client = await OpenCodeClient.connect(env);
  const startedAt = Date.now();
  let page: any;
  try {
    page = await client.request({
      operation: "session.list",
      query: { limit, order: "desc" },
    });
  } catch (error) {
    await recordJournaledOperation({
      operation: "opencode.session.sessions",
      outcome: "failure",
      startedAt,
      endedAt: Date.now(),
      env,
    });
    throw error;
  }
  const endedAt = Date.now();
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
  await recordJournaledOperation({
    operation: "opencode.session.sessions",
    outcome: "success",
    startedAt,
    endedAt,
    env,
  });
}
