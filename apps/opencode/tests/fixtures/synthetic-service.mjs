import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const version = "2.4.1";
const file = process.env.SYNTHETIC_SERVICE_FILE;
if (!file) {
  console.error("SYNTHETIC_SERVICE_FILE is required");
  process.exit(64);
}

const json = (response, value) => {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
};

const openapi = {
  paths: {
    "/api/server/info": { get: { operationId: "server.info" } },
  },
};

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (url.pathname === "/api/info")
    return json(response, { version, pid: process.pid });
  if (url.pathname === "/openapi.json") return json(response, openapi);
  if (url.pathname === "/api/server/info")
    return json(response, { healthy: true, version, pid: process.pid });
  return json(response, { path: url.pathname, method: request.method });
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") process.exit(1);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(
    file,
    JSON.stringify({
      id: "synthetic",
      version,
      url: `http://127.0.0.1:${address.port}`,
      pid: process.pid,
    }),
  );
});

const stop = () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
