export function startStub() {
  let requests = 0;
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      requests++;
      const u = new URL(req.url);
      if (u.pathname === "/openapi.json")
        return Response.json({
          paths: {
            "/api/session/{sessionID}/prompt": {
              post: {
                operationId: "session.prompt",
                parameters: [
                  {
                    name: "sessionID",
                    in: "path",
                    required: true,
                  },
                ],
              },
            },
            "/api/session/{sessionID}": {
              delete: {
                operationId: "session.remove",
                parameters: [
                  {
                    name: "sessionID",
                    in: "path",
                    required: true,
                  },
                ],
              },
            },
            "/api/server/info": {
              get: { operationId: "server.info" },
            },
            "/auth/connect/{code}": {
              get: { operationId: "server.connect" },
            },
          },
        });
      if (u.pathname === "/api/event")
        return new Response(
          'event: session.idle\ndata: {"type":"session.idle","password":"private"}\n\n',
          { headers: { "content-type": "text/event-stream" } },
        );
      return Response.json({
        path: u.pathname,
        method: req.method,
        password: "private",
      });
    },
  });
  return {
    server,
    url: `http://127.0.0.1:${server.port}`,
    get requests() {
      return requests;
    },
  };
}
