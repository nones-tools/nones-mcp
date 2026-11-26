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

test("Node stdio MCP initializes with version and pretty parity", async () => {
  const child = startCli("mcp", { OPENCODE_MCP_URL: url });
  child.stdin?.write(
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test", version: "1" },
      },
    }),
  );
  child.stdin?.write(
    send({ jsonrpc: "2.0", method: "notifications/initialized" }),
  );
  child.stdin?.write(
    send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
  );
  child.stdin?.write(
    send({
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
    }),
  );
  const messages = await waitForMessages(child, (all) =>
    [1, 2, 3].every((id) => all.some((message) => message.id === id)),
  );
  child.kill();

  const initialize = messages.find((message) => message.id === 1);
  expect(initialize?.result.serverInfo).toMatchObject({
    name: "opencode-mcp",
    version: "0.2.0",
  });

  const list = messages.find((message) => message.id === 2);
  expect(JSON.stringify(list?.result)).toContain("opencode_session_prompt");

  const call = messages.find((message) => message.id === 3);
  const data = call?.result.structuredContent.data;
  expect(call?.result.content[0].text).toBe(formatJson(data));
  expect(call?.result.content[0].text).toContain('\n  "path"');
  expect(JSON.parse(call?.result.content[0].text)).toEqual(data);
  expect(JSON.stringify(call)).not.toContain("private");
});
