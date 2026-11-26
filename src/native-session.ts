import type { OpenCodeClient } from "./client";
import type { ModelRef } from "./session-model";

export interface SessionTime {
  created?: number;
  updated?: number;
  busy?: number;
  idle?: number;
}

export interface SessionInfo {
  id: string;
  title?: string;
  parentID?: string;
  outcome?: string;
  agent?: string;
  model?: ModelRef;
  time?: SessionTime;
  location?: { directory?: string };
  [key: string]: unknown;
}

export interface SessionReceipt {
  id?: string;
  sessionID?: string;
  type?: string;
  delivery?: string;
  time?: { created?: number };
  payload?: unknown;
  [key: string]: unknown;
}

export type Delivery = "steer" | "queue";

/** Native responses wrap payloads in `data`; accept either shape. */
export function unwrapData<T>(value: any): T {
  return (
    value && typeof value === "object" && "data" in value ? value.data : value
  ) as T;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

export async function getSession(
  client: OpenCodeClient,
  sessionID: string,
  signal?: AbortSignal,
): Promise<SessionInfo> {
  const info = unwrapData<SessionInfo>(
    await client.request(
      { operation: "session.get", path: { sessionID } },
      signal,
    ),
  );
  if (!info?.id) throw new Error("Session response did not include an ID");
  return info;
}

export async function createSession(
  client: OpenCodeClient,
  directory: string,
  model: ModelRef,
  title?: string,
): Promise<SessionInfo> {
  const body: Record<string, unknown> = {
    location: { directory },
    model,
  };
  if (title) body.title = title;
  const info = unwrapData<SessionInfo>(
    await client.request({ operation: "session.create", body }),
  );
  if (!info?.id) throw new Error("Session creation did not return an ID");
  return info;
}

export async function submitPrompt(
  client: OpenCodeClient,
  sessionID: string,
  text: string,
  delivery: Delivery,
): Promise<SessionReceipt> {
  return unwrapData<SessionReceipt>(
    await client.request({
      operation: "session.prompt",
      path: { sessionID },
      body: { text, delivery },
    }),
  );
}

/** Keep a created session ID visible when only the prompt handoff fails. */
export function sessionFailure(sessionID: string, error: unknown): Error {
  return new Error(
    `Session ${sessionID} was created but prompt submission failed: ${errorText(error)}`,
  );
}

/** Reject empty or unknown delivery values before mutating a session. */
export function parseDelivery(value: string): Delivery {
  if (value === "steer" || value === "queue") return value;
  throw new Error('Delivery must be "steer" or "queue"');
}
