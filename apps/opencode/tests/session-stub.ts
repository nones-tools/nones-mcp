import { sessionModels, sessionOpenApi } from "./session-openapi";
import { createSessionState, type StubOptions } from "./session-state";

export type { StubOptions, StubPrompt } from "./session-state";

export function startSessionStub(options: StubOptions = {}) {
  const state = createSessionState(options);

  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const parts = url.pathname.split("/").filter(Boolean);
      if (url.pathname === "/openapi.json")
        return Response.json(sessionOpenApi);
      if (url.pathname === "/api/event")
        return new Response(
          new ReadableStream({
            start(controller) {
              state.attach(controller);
            },
            cancel() {
              state.detach();
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        );
      if (url.pathname === "/api/server/info")
        return Response.json({ data: { version: "2.4.1" } });
      if (url.pathname === "/api/model")
        return Response.json({
          location: { directory: url.searchParams.get("location[directory]") },
          data:
            options.emptyLocationModels &&
            url.searchParams.has("location[directory]")
              ? []
              : sessionModels,
        });
      if (url.pathname === "/api/session" && req.method === "GET") {
        const limit = Number(url.searchParams.get("limit") ?? 20);
        const data = [...state.sessions.values()]
          .sort((a, b) => b.time.updated - a.time.updated)
          .slice(0, limit);
        return Response.json({ data, cursor: { next: null, previous: null } });
      }
      if (url.pathname === "/api/session" && req.method === "POST")
        return Response.json({ data: state.create(await req.json()) });
      if (parts[1] === "session" && parts[2]) {
        const id = parts[2];
        const info = state.sessions.get(id);
        if (!info) return Response.json({ error: "missing" }, { status: 404 });
        if (parts.length === 3 && req.method === "GET") {
          if (options.getDelayMs)
            await new Promise((resolve) =>
              setTimeout(resolve, options.getDelayMs),
            );
          return Response.json({ data: info });
        }
        if (parts[3] === "interrupt") {
          state.recordInterrupt();
          return Response.json({ data: info });
        }
        if (parts[3] === "message")
          return Response.json({
            data: [...(state.history.get(id) ?? [])].reverse(),
            cursor: { next: null, previous: null },
          });
        if (parts[3] === "prompt" && req.method === "POST") {
          const receipt = state.prompt(id, await req.json());
          return receipt
            ? Response.json({ data: receipt })
            : Response.json({ error: "rejected" }, { status: 500 });
        }
      }
      return Response.json({ error: "not found" }, { status: 404 });
    },
  });

  return {
    server,
    url: `http://127.0.0.1:${server.port}`,
    beginTurn: state.beginTurn,
    finishTurn: state.finishTurn,
    emit: state.emit,
    seed: state.seed,
    get creates() {
      return state.creates;
    },
    get prompts() {
      return state.prompts;
    },
    get interrupts() {
      return state.interrupts;
    },
    get lastPrompt() {
      return state.lastPrompt;
    },
    get streams() {
      return state.streams;
    },
  };
}
