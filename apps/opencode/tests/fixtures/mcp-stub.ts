const failTool = process.env.STUB_TOOL_ERROR;
const write = (message: unknown) => {
  process.stdout.write(`${JSON.stringify(message)}\n`);
};

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    const message = JSON.parse(line);
    if (message.method === "initialize")
      write({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "opencode-mcp-stub", version: "0.4.0-test" },
        },
      });
    else if (message.method === "tools/list")
      write({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          tools: [
            {
              name: "opencode_server_info",
              description: "harmless readiness fixture",
              inputSchema: { type: "object", properties: {} },
            },
          ],
        },
      });
    else if (message.method === "tools/call")
      if (failTool === "throw")
        write({
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32000, message: "synthetic info failure" },
        });
      else
        write({
          jsonrpc: "2.0",
          id: message.id,
          result: {
            content: [{ type: "text", text: '{"healthy":true}' }],
            structuredContent: { data: { healthy: true } },
            ...(failTool === "1" ? { isError: true } : {}),
          },
        });
    else if (message.method === "ping")
      write({ jsonrpc: "2.0", id: message.id, result: {} });
  }
});
process.stdin.resume();
