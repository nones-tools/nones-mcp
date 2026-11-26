import { afterAll, beforeAll, expect, test } from "bun:test";
import { formatJson } from "../src/json";
import { startCli, waitForMessages } from "./stdio";
import { startStub } from "./stub";

let stub: ReturnType<typeof startStub>;
let url: string;

beforeAll(() => {
  stub = startStub();
  url = stub.url;
});
afterAll(() => stub.server.stop(true));

const send = (message: unknown): string => `${JSON.stringify(message)}\n`;

async function openSession(args: string[], extra: unknown[] = []) {
  const child = startCli(args, { OPENCODE_MCP_URL: url });
  const requests: unknown[] = [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test", version: "1" },
      },
    },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    ...extra,
  ];
  for (const request of requests) child.stdin?.write(send(request));
  const ids = requests.flatMap((request: any) =>
    typeof request.id === "number" ? [request.id] : [],
  );
  const messages = await waitForMessages(child, (all) =>
    ids.every((id) => all.some((message) => message.id === id)),
  );
  child.kill();
  return messages;
}

test("Node stdio MCP initializes with version and pretty parity", async () => {
  const messages = await openSession(
    ["mcp"],
    [
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "opencode_session_prompt",
          arguments: {
            path: { sessionID: "test" },
            body: { text: "test" },
          },
        },
      },
    ],
  );

  const initialize = messages.find((message) => message.id === 1);
  expect(initialize?.result.serverInfo).toMatchObject({
    name: "opencode-mcp",
    version: "0.3.0",
  });

  const list = messages.find((message) => message.id === 2);
  expect(JSON.stringify(list?.result)).toContain("opencode_session_prompt");

  const call = messages.find((message) => message.id === 3);
  const data = call?.result.structuredContent.data;
  expect(call?.result.content[0].text).toBe(formatJson(data));
  expect(call?.result.content[0].text).toContain('\n  "path"');
  expect(JSON.parse(call?.result.content[0].text)).toEqual(data);
  expect(JSON.stringify(call)).not.toContain("private");
}, 15000);

test("the default launch without arguments serves MCP over stdio", async () => {
  const messages = await openSession(
    [],
    [
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "opencode_server_info", arguments: {} },
      },
    ],
  );

  const initialize = messages.find((message) => message.id === 1);
  expect(initialize?.result.serverInfo).toMatchObject({
    name: "opencode-mcp",
    version: "0.3.0",
  });

  const list = messages.find((message) => message.id === 2);
  expect(JSON.stringify(list?.result)).toContain("opencode_server_info");

  const call = messages.find((message) => message.id === 3);
  expect(call?.result.structuredContent.data.path).toBe("/api/server/info");
  expect(JSON.stringify(call)).not.toContain("private");
}, 15000);
