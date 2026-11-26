export interface StubOptions {
  auto?: boolean;
  promptDelay?: number;
  turnDelay?: number;
  outcome?: "succeeded" | "failed" | "interrupted";
  failPrompts?: number;
  getDelayMs?: number;
  emptyLocationModels?: boolean;
}

export interface StubPrompt {
  sessionID: string;
  body: { text?: string; delivery?: string };
}

const encoder = new TextEncoder();

export function createSessionState(options: StubOptions = {}) {
  const sessions = new Map<string, any>();
  const history = new Map<string, any[]>();
  const streams = new Set<ReadableStreamDefaultController<Uint8Array>>();
  let counter = 0;
  let creates = 0;
  let prompts = 0;
  let interrupts = 0;
  let failPrompts = options.failPrompts ?? 0;
  let lastPrompt: StubPrompt | undefined;

  const emit = (sessionID: string, type: string, data: object) => {
    const native = {
      id: `evt_${++counter}`,
      created: Date.now(),
      type,
      durable: { aggregateID: sessionID, seq: counter, version: 1 },
      data: { sessionID, ...data },
    };
    const frame = encoder.encode(`data: ${JSON.stringify(native)}\n\n`);
    for (const stream of streams) {
      try {
        stream.enqueue(frame);
      } catch {
        streams.delete(stream);
      }
    }
  };

  const update = (id: string, patch: (info: any) => void) => {
    const info = sessions.get(id);
    if (!info) return;
    patch(info);
    info.time.updated = Date.now();
  };

  const beginTurn = (id: string) => {
    update(id, (info) => {
      info.time.busy = Date.now();
      info.outcome = undefined;
    });
    emit(id, "session.execution.started", {});
  };

  const finishTurn = (
    id: string,
    outcome: "succeeded" | "failed" | "interrupted" = "succeeded",
  ) => {
    update(id, (info) => {
      info.time.idle = Date.now();
      info.outcome = outcome;
    });
    emit(
      id,
      outcome === "succeeded"
        ? "session.execution.succeeded"
        : outcome === "failed"
          ? "session.execution.failed"
          : "session.execution.interrupted",
      outcome === "failed" ? { error: { message: "boom" } } : {},
    );
    emit(id, "session.idle", {});
    const list = history.get(id) ?? [];
    list.push({
      id: `msg_assistant_${list.length}`,
      time: { created: Date.now(), completed: Date.now() },
      type: "assistant",
      content: [{ type: "text", text: "done" }],
    });
    history.set(id, list);
  };

  const create = (body: any) => {
    const id = `ses_test_${++creates}`;
    const now = Date.now();
    const info = {
      id,
      projectID: "project",
      title: body.title ?? "Untitled",
      model: body.model ?? null,
      cost: 0,
      tokens: {},
      time: { created: now, updated: now },
      location: { directory: body.location?.directory },
    };
    sessions.set(id, info);
    history.set(id, []);
    return info;
  };

  const prompt = (id: string, body: any) => {
    if (failPrompts > 0) {
      failPrompts--;
      return null;
    }
    prompts++;
    lastPrompt = { sessionID: id, body };
    const receipt = {
      id: `msg_user_${prompts}`,
      sessionID: id,
      time: { created: Date.now() },
      type: "user",
      payload: { text: body.text },
      delivery: body.delivery,
    };
    history.set(id, [...(history.get(id) ?? []), receipt]);
    update(id, (info) => {
      info.time.updated = Date.now();
    });
    if (options.auto)
      setTimeout(() => {
        beginTurn(id);
        setTimeout(
          () => finishTurn(id, options.outcome ?? "succeeded"),
          options.turnDelay ?? 0,
        );
      }, options.promptDelay ?? 0);
    return receipt;
  };

  const seed = (directory: string, patch: (info: any) => void = () => {}) => {
    const id = `ses_seed_${sessions.size + 1}`;
    const now = Date.now();
    const info = {
      id,
      projectID: "project",
      title: "Seeded",
      cost: 0,
      tokens: {},
      time: { created: now, updated: now },
      location: { directory },
    };
    patch(info);
    sessions.set(id, info);
    history.set(id, []);
    return info;
  };

  return {
    sessions,
    history,
    emit,
    beginTurn,
    finishTurn,
    seed,
    create,
    prompt,
    attach: (stream: ReadableStreamDefaultController<Uint8Array>) =>
      streams.add(stream),
    detach: () => streams.clear(),
    recordInterrupt: () => {
      interrupts++;
    },
    get creates() {
      return creates;
    },
    get prompts() {
      return prompts;
    },
    get interrupts() {
      return interrupts;
    },
    get lastPrompt() {
      return lastPrompt;
    },
    get streams() {
      return streams.size;
    },
  };
}
