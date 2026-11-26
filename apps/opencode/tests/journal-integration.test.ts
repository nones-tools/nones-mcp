import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { startCli, waitForExit } from "./stdio";
import { startSessionStub } from "./session-stub";

let root: string, inside: string, prompt: string, config: string;

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), "oc2-journal-integration-"));
  inside = path.join(root, "inside");
  mkdirSync(inside);
  prompt = path.join(root, "prompt.txt");
  writeFileSync(prompt, "Synthetic integration marker.\n");
  config = path.join(root, "config.json");
  writeFileSync(
    config,
    JSON.stringify({
      shared: { monorepo: true },
      journal: { sqlitePath: path.join(root, "journal.sqlite") },
    }),
  );
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

interface RecordView {
  operation: string;
  sessionId?: string;
  sessionTitle?: string;
  outcome?: string;
  prompt?: unknown;
}

function envFor(stub: ReturnType<typeof startSessionStub>) {
  return {
    OPENCODE_MCP_URL: stub.url,
    OPENCODE_MCP_CONFIG: config,
    XDG_STATE_HOME: path.join(root, "state"),
    OPENCODE_MCP_MODEL: "",
    OC2_MODEL: "",
  };
}

async function waitForStream(stub: ReturnType<typeof startSessionStub>) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (stub.streams > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Monitor did not attach a stream");
}

test("start, send and monitor journal results with native metadata", async () => {
  const stub = startSessionStub();
  try {
    const env = envFor(stub);
    const started = await waitForExit(
      startCli(
        [
          "start",
          "-C",
          inside,
          "-f",
          prompt,
          "--model",
          "opencode-go/test-model#high",
          "--title",
          "Synthetic title",
        ],
        env,
      ),
      10_000,
    );
    expect(started.code).toBe(0);
    const startedJson = JSON.parse(started.stdout);
    expect(startedJson.sessionID).toBe("ses_test_1");

    const sent = await waitForExit(
      startCli(["send", startedJson.sessionID, "-f", prompt], env),
      10_000,
    );
    expect(sent.code).toBe(0);

    stub.beginTurn(startedJson.sessionID);
    const monitored = startCli(
      ["monitor", startedJson.sessionID, "--until-turn"],
      env,
    );
    await waitForStream(stub);
    stub.finishTurn(startedJson.sessionID, "succeeded");
    const monitorResult = await waitForExit(monitored, 10_000);
    expect(monitorResult.code).toBe(0);

    const listed = await waitForExit(
      startCli(["journal", "list", "--include-prompts"], env),
      10_000,
    );
    expect(listed.code).toBe(0);
    const page = JSON.parse(listed.stdout);
    const records = page.records as Array<Record<string, unknown>>;
    expect(records.map((record) => record.operation)).toEqual([
      "opencode.session.monitor",
      "opencode.session.send",
      "opencode.session.start",
    ]);
    expect(records[2]).toMatchObject({
      sessionId: "ses_test_1",
      sessionTitle: "Synthetic title",
      messageId: "msg_user_1",
      prompt: "Synthetic integration marker.\n",
      outcome: "success",
    });
    expect(records[1]).toMatchObject({
      sessionId: "ses_test_1",
      sessionTitle: "Synthetic title",
      messageId: "msg_user_2",
      prompt: "Synthetic integration marker.\n",
      outcome: "success",
    });
    expect(records[0]).toMatchObject({
      sessionId: "ses_test_1",
      outcome: "success",
    });
    expect(records[0].prompt).toBeUndefined();

    const statsResult = await waitForExit(
      startCli(["journal", "stats"], env),
      10_000,
    );
    expect(statsResult.code).toBe(0);
    const stats = JSON.parse(statsResult.stdout);
    expect(stats.total).toBe(3);
    expect(stats.byOperation).toHaveLength(3);
  } finally {
    stub.server.stop(true);
  }
}, 20_000);

test("status, messages and sessions journal without prompt text", async () => {
  const stub = startSessionStub();
  try {
    const env = envFor(stub);
    const session = stub.seed(inside);
    for (const args of [
      ["status", session.id],
      ["messages", session.id],
      ["sessions", "--limit", "5"],
    ]) {
      const result = await waitForExit(startCli(args, env), 10_000);
      expect(result.code).toBe(0);
    }
    const listed = await waitForExit(
      startCli(["journal", "list"], env),
      10_000,
    );
    const records = JSON.parse(listed.stdout).records as RecordView[];
    expect(records.slice(0, 3).map((record) => record.operation)).toEqual([
      "opencode.session.sessions",
      "opencode.session.messages",
      "opencode.session.status",
    ]);
    expect(records[2]).toMatchObject({
      sessionId: session.id,
      sessionTitle: "Seeded",
      outcome: "success",
    });
    expect(records.every((record) => record.prompt === undefined)).toBe(true);
  } finally {
    stub.server.stop(true);
  }
}, 20_000);

test("send admission is not delayed by the best-effort title lookup", async () => {
  const stub = startSessionStub({ getDelayMs: 3_000 });
  try {
    const env = envFor(stub);
    const session = stub.seed(inside);
    const started = Date.now();
    const sent = await waitForExit(
      startCli(["send", session.id, "-f", prompt], env),
      10_000,
    );
    expect(sent.code).toBe(0);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(JSON.parse(sent.stdout).sessionID).toBe(session.id);
    const listed = await waitForExit(
      startCli(["journal", "list"], env),
      10_000,
    );
    const records = JSON.parse(listed.stdout).records as RecordView[];
    expect(records[0].operation).toBe("opencode.session.send");
    expect(records[0].sessionId).toBe(session.id);
    expect(records[0].sessionTitle).toBeUndefined();
  } finally {
    stub.server.stop(true);
  }
}, 20_000);
