export interface NativeEvent {
  type?: string;
  id?: string;
  created?: number;
  durable?: { seq?: number; aggregateID?: string };
  data?: any;
}

export interface NormalizedEvent {
  event:
    | "turn-start"
    | "steer-delivered"
    | "tool-completed"
    | "idle"
    | "success"
    | "failure";
  sessionID: string;
  at: number | null;
  messageID?: string;
  toolID?: string;
  status?: "success" | "failed";
  reason?: string;
  error?: unknown;
}

export interface NativeLine {
  [key: string]: unknown;
  event: "native";
  sessionID: string;
  type: string;
  id: string | null;
  seq: number | null;
  messageID: string | null;
  data: unknown;
}

const noisy = /\.(?:delta|progress)$/;

/** Delta and progress chunks are filtered; structural events are kept. */
export function isNoisyNative(type: string): boolean {
  return noisy.test(type);
}

export function eventSessionID(native: NativeEvent): unknown {
  return (
    native?.data?.sessionID ??
    native?.durable?.aggregateID ??
    (native as any)?.aggregateID
  );
}

export function terminalKey(native: NativeEvent): string {
  return String(
    native?.id ??
      (native?.durable?.seq !== undefined
        ? `seq:${native.durable.seq}`
        : `${native?.type}:${native?.created ?? 0}`),
  );
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function at(native: NativeEvent): number | null {
  return typeof native?.created === "number" ? native.created : null;
}

/** Map a real native event to at most one actionable normalized event. */
export function normalizeNative(
  native: NativeEvent,
  sessionID: string,
): NormalizedEvent | null {
  const data = native?.data ?? {};
  const messageID = text(data.assistantMessageID);
  const base = { sessionID, at: at(native) };
  switch (native?.type) {
    case "session.execution.started":
      return { event: "turn-start", ...base };
    case "session.inbox.delivered":
      return {
        event: "steer-delivered",
        ...base,
        messageID: text(data.inboxID) ?? messageID,
      };
    case "session.tool.success":
      return {
        event: "tool-completed",
        ...base,
        messageID,
        toolID: text(data.id),
        status: "success",
      };
    case "session.tool.failed":
      return {
        event: "tool-completed",
        ...base,
        messageID,
        toolID: text(data.id),
        status: "failed",
        error: data.error,
      };
    case "session.idle":
      return { event: "idle", ...base };
    case "session.execution.succeeded":
      return { event: "success", ...base, reason: "succeeded" };
    case "session.execution.failed":
      return {
        event: "failure",
        ...base,
        reason: "failed",
        error: data.error,
      };
    case "session.execution.interrupted":
      return {
        event: "failure",
        ...base,
        reason: text(data.reason) ?? "interrupted",
      };
    default:
      return null;
  }
}

/** Keep protocol output one native line with stable, readable fields. */
export function nativeLine(native: NativeEvent, sessionID: string): NativeLine {
  const data = native?.data ?? {};
  return {
    event: "native",
    sessionID,
    type: native?.type ?? "unknown",
    id: native?.id ?? null,
    seq: typeof native?.durable?.seq === "number" ? native.durable.seq : null,
    messageID:
      text(data.assistantMessageID) ??
      text(data.inboxID) ??
      text(data.messageID) ??
      null,
    data,
  };
}
