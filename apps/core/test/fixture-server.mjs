#!/usr/bin/env node
// Minimal stdio MCP fixture used to prove child lifecycle handling.
import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

writeFileSync(process.env.PID_FILE ?? "fixture.pid", String(process.pid));

const lines = createInterface({ input: process.stdin });
const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);

lines.on("line", (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method, params } = message;
  if (method === "initialize") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "fixture-server", version: "1.0.0" },
      },
    });
    return;
  }
  if (method === "tools/list") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        tools: [
          {
            name: "fixture_echo",
            description: "Echo through the fixture server.",
            inputSchema: { type: "object", properties: {}, additionalProperties: false },
            annotations: { readOnlyHint: true },
          },
        ],
      },
    });
    return;
  }
  if (method === "tools/call") {
    if (params?.name !== "fixture_echo") {
      send({ jsonrpc: "2.0", id, error: { code: -32602, message: "unknown tool" } });
      return;
    }
    send({
      jsonrpc: "2.0",
      id,
      result: { content: [{ type: "text", text: "fixture-ok" }], isError: false },
    });
    return;
  }
  if (id !== undefined) {
    send({ jsonrpc: "2.0", id, error: { code: -32601, message: "method not found" } });
  }
});

process.stdin.on("end", () => process.exit(0));
