import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Client } from "@modelcontextprotocol/client";
import kaitenPackage from "../../kaiten/package.json" with { type: "json" };
import { KAITEN_TOKEN, setupE2E, type E2EFixture } from "./fixtures";

let fixture: E2EFixture;
let client: Client;
let slowFixture: E2EFixture;
let slowClient: Client;

beforeAll(async () => {
  fixture = await setupE2E();
  client = await fixture.connect();
  slowFixture = await setupE2E(900);
  slowClient = await slowFixture.connect();
}, 30_000);

afterAll(async () => {
  await fixture.close();
  await slowFixture.close();
}, 30_000);

describe("forwarded calls", () => {
  test("kaiten_health reports readiness without leaking the token", async () => {
    const result = await client.callTool({ name: "kaiten_health", arguments: {} });
    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    const report = JSON.parse(text) as {
      serverVersion: string;
      ready: boolean;
      apiToken: { present: boolean };
    };
    expect(report.serverVersion).toBe(kaitenPackage.version);
    expect(report.ready).toBe(true);
    expect(report.apiToken.present).toBe(true);
    expect(text).not.toContain(KAITEN_TOKEN);
  });

  test("opencode_server_info preserves the native structured result", async () => {
    const result = await client.callTool({ name: "opencode_server_info", arguments: {} });
    expect(result.isError).toBeFalsy();
    // opencode-mcp wraps native payloads once more: toolResult({ data }).
    expect(result.structuredContent).toEqual({
      data: { data: { version: "2.4.1", healthy: true } },
    });
  });

  test("task-augmented requests stay synchronous, matching child capabilities", async () => {
    const result = await client.callTool({
      name: "kaiten_health",
      arguments: {},
      task: {},
    } as never);
    expect(result.isError).toBeFalsy();
    expect((result.content[0] as { text: string }).text).toContain(
      kaitenPackage.version,
    );
  });

  test("unknown tools produce the standard JSON-RPC invalid params error", async () => {
    const error = (await client
      .callTool({ name: "kaiten_missing_tool", arguments: {} })
      .catch((cause: unknown) => cause)) as { code?: number; message?: string };
    expect(error.code).toBe(-32602);
    expect(error.message).toContain("kaiten_missing_tool");
  });

  test("child JSON-RPC errors keep the child code and message", async () => {
    const error = (await client
      .callTool({ name: "kaiten_get_blockers", arguments: { cardId: "not-a-number" } })
      .catch((cause: unknown) => cause)) as { code?: number; message?: string };
    expect(typeof error.code).toBe("number");
    expect(error.message).toBeTruthy();
  });

  test("cancellation propagates without breaking the shared child", async () => {
    const aborted = await slowClient
      .callTool(
        { name: "opencode_session_message_list", arguments: { path: { sessionID: "ses_1" } } },
        { signal: AbortSignal.timeout(150) },
      )
      .then(() => undefined)
      .catch((error: unknown) => error as Error);
    expect(aborted).toBeInstanceOf(Error);
    const recovered = await slowClient.callTool({
      name: "opencode_server_info",
      arguments: {},
    });
    expect(recovered.isError).toBeFalsy();
    expect((recovered.content[0] as { text: string }).text).toContain("healthy");
  });
});
