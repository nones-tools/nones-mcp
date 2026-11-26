import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface OpencodeStub {
  url: string;
  counts: Record<string, number>;
  close(): Promise<void>;
}

const OPENAPI = {
  openapi: "3.0.0",
  info: { title: "OpenCode stub", version: "2.4.1" },
  paths: {
    "/api/server": {
      get: { operationId: "server.info", summary: "Read safe server information." },
    },
    "/api/session": {
      get: { operationId: "session.list", summary: "List sessions." },
    },
    "/api/session/{sessionID}/message": {
      get: {
        operationId: "session.message.list",
        summary: "List session messages.",
        parameters: [
          {
            name: "sessionID",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
      },
    },
  },
};

function send(response: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(text),
  });
  response.end(text);
}

/** Fixture OpenCode 2 service; no credentials and no writes. */
export async function startOpencodeStub(
  options: { slowMs?: number } = {},
): Promise<OpencodeStub> {
  const counts: Record<string, number> = {};
  const sockets = new Set<import("node:net").Socket>();
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const route = (request.url ?? "/").split("?")[0] ?? "/";
    counts[route] = (counts[route] ?? 0) + 1;
    if (route === "/openapi.json") return send(response, 200, OPENAPI);
    if (route === "/api/server") {
      return send(response, 200, { data: { version: "2.4.1", healthy: true } });
    }
    if (route === "/api/session") {
      return send(response, 200, { data: [{ id: "ses_1", title: "fixture" }] });
    }
    if (route === "/api/session/ses_1/message") {
      const delay = options.slowMs ?? 0;
      const timer = setTimeout(() => send(response, 200, { data: [] }), delay);
      response.on("close", () => clearTimeout(timer));
      return undefined;
    }
    return send(response, 404, { error: "not found" });
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    counts,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
