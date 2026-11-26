import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { OpenCodeClient, classify, sanitize } from "../src/client";
import { startStub } from "./stub";

let stub: ReturnType<typeof startStub>;
let url: string;

beforeAll(() => {
  stub = startStub();
  url = stub.url;
});
afterAll(() => stub.server.stop(true));

describe("client", () => {
  test("routes IDs safely and filters secrets and auth operations", async () => {
    const client = await OpenCodeClient.connect({
      OPENCODE_MCP_URL: url,
    });
    expect((await client.operations()).map((x) => x.id)).not.toContain(
      "server.connect",
    );
    expect(
      await client.request({
        operation: "session.prompt",
        path: { sessionID: "id ?" },
        body: { text: "hello" },
      }),
    ).toEqual({ path: "/api/session/id%20%3F/prompt", method: "POST" });
    expect(
      client.request({
        operation: "session.prompt",
        path: { sessionID: "../other" },
      }),
    ).rejects.toThrow();
  });

  test("destructive access needs both gate and confirmation", async () => {
    const client = await OpenCodeClient.connect({
      OPENCODE_MCP_URL: url,
      OPENCODE_MCP_ALLOW_DESTRUCTIVE: "1",
    });
    expect(
      client.request({
        operation: "session.remove",
        path: { sessionID: "x" },
      }),
    ).rejects.toThrow("confirm");
    expect(
      (
        await client.request({
          operation: "session.remove",
          path: { sessionID: "x" },
          confirm: true,
        })
      ).method,
    ).toBe("DELETE");
  });

  test("filters events and rejects unsupported global cursor", async () => {
    const client = await OpenCodeClient.connect({
      OPENCODE_MCP_URL: url,
    });
    const result = await client.events({
      types: ["session.idle"],
      durationMs: 100,
    });
    expect(result.events).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("private");
    expect(client.events({ source: "live", after: 1 })).rejects.toThrow(
      "cursor",
    );
  });

  test("redacts recursively and classifies writes", () => {
    expect(sanitize({ data: { accessToken: "private", other: "ok" } })).toEqual(
      { data: { other: "ok" } },
    );
    expect(
      classify({
        id: "session.shell",
        method: "POST",
        path: "",
        parameters: [],
      }),
    ).toBe("exec");
  });
});
