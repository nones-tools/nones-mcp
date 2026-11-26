import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { startCli, waitForExit } from "./stdio";
import { startSessionStub } from "./session-stub";

let root: string;
let prompt: string;
beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), "oc2-monitor-"));
  prompt = path.join(root, "prompt.txt");
  writeFileSync(prompt, "Monitor marker");
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

function lines(stdout: string): any[] {
  return stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function busySeed(stub: ReturnType<typeof startSessionStub>) {
  return stub.seed(root, (info) => {
    info.time.created = Date.now() - 1000;
    info.time.busy = Date.now() - 500;
  });
}

async function waitForStream(stub: ReturnType<typeof startSessionStub>) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (stub.streams > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Monitor did not attach a stream");
}

test("monitor attaches to a busy session and finishes after its turn", async () => {
  const stub = startSessionStub();
  try {
    const session = busySeed(stub);
    const child = startCli(["monitor", session.id, "--until-turn"], {
      OPENCODE_MCP_URL: stub.url,
    });
    await waitForStream(stub);
    stub.emit(session.id, "session.tool.success", {
      assistantMessageID: "msg_assistant_1",
      id: "call_1",
      content: [],
      executed: true,
    });
    stub.finishTurn(session.id, "succeeded");
    const result = await waitForExit(child, 10_000);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    const events = lines(result.stdout);
    expect(events[0]).toMatchObject({
      event: "status",
      sessionID: session.id,
      busy: true,
    });
    expect(events).toContainEqual(
      expect.objectContaining({
        event: "tool-completed",
        sessionID: session.id,
        messageID: "msg_assistant_1",
        toolID: "call_1",
        status: "success",
      }),
    );
    expect(events.some((event) => event.event === "success")).toBe(true);
  } finally {
    stub.server.stop(true);
  }
}, 15_000);

test("monitor attach to an idle session waits for the next turn", async () => {
  const stub = startSessionStub();
  try {
    const session = stub.seed(root);
    const child = startCli(["monitor", session.id, "--until-turn"], {
      OPENCODE_MCP_URL: stub.url,
    });
    setTimeout(() => {
      stub.beginTurn(session.id);
      setTimeout(() => stub.finishTurn(session.id, "succeeded"), 200);
    }, 400);
    const result = await waitForExit(child, 10_000);
    expect(result.code).toBe(0);
    const events = lines(result.stdout);
    expect(events[0]).toMatchObject({ event: "status", busy: false });
    expect(events.some((event) => event.event === "turn-start")).toBe(true);
    expect(events.some((event) => event.event === "success")).toBe(true);
  } finally {
    stub.server.stop(true);
  }
}, 15_000);

test("terminal failure exits nonzero and timeout exits 124", async () => {
  const failure = startSessionStub();
  try {
    const session = busySeed(failure);
    const child = startCli(["monitor", session.id, "--until-turn"], {
      OPENCODE_MCP_URL: failure.url,
    });
    setTimeout(() => failure.finishTurn(session.id, "failed"), 300);
    const result = await waitForExit(child, 10_000);
    expect(result.code).toBe(2);
    expect(
      lines(result.stdout).some((event) => event.event === "failure"),
    ).toBe(true);
  } finally {
    failure.server.stop(true);
  }

  const timeout = startSessionStub();
  try {
    const session = timeout.seed(root);
    const result = await waitForExit(
      startCli(["monitor", session.id, "--until-turn", "--timeout", "1"], {
        OPENCODE_MCP_URL: timeout.url,
      }),
      10_000,
    );
    expect(result.code).toBe(124);
    const events = lines(result.stdout);
    expect(events.at(-1)).toMatchObject({
      event: "timeout",
      sessionID: session.id,
    });
  } finally {
    timeout.server.stop(true);
  }
}, 15_000);

test("Ctrl+C stops observation without interrupting the session", async () => {
  const stub = startSessionStub();
  try {
    const session = busySeed(stub);
    const child = startCli(["monitor", session.id], {
      OPENCODE_MCP_URL: stub.url,
    });
    setTimeout(() => child.kill("SIGINT"), 400);
    const result = await waitForExit(child, 10_000);
    expect(result.code).toBe(130);
    expect(stub.interrupts).toBe(0);
    expect(lines(result.stdout).at(-1)).toMatchObject({
      event: "stopped",
      reason: "signal",
    });
  } finally {
    stub.server.stop(true);
  }
}, 15_000);

test("follow mode reports a failed turn but keeps observing", async () => {
  const stub = startSessionStub();
  try {
    const session = busySeed(stub);
    const child = startCli(["monitor", session.id], {
      OPENCODE_MCP_URL: stub.url,
    });
    const exited = waitForExit(child, 10_000);
    await waitForStream(stub);
    stub.finishTurn(session.id, "failed");
    await new Promise((resolve) => setTimeout(resolve, 1800));
    expect(child.exitCode).toBeNull();
    child.kill("SIGINT");
    const result = await exited;
    expect(result.code).toBe(130);
    expect(
      lines(result.stdout).some((event) => event.event === "failure"),
    ).toBe(true);
  } finally {
    stub.server.stop(true);
  }
}, 15_000);

test("timeout aborts a blocked session.get instead of overshooting", async () => {
  const stub = startSessionStub({ getDelayMs: 2500 });
  try {
    const session = stub.seed(root);
    const started = Date.now();
    const result = await waitForExit(
      startCli(["monitor", session.id, "--until-turn", "--timeout", "1"], {
        OPENCODE_MCP_URL: stub.url,
      }),
      10_000,
    );
    expect(result.code).toBe(124);
    expect(Date.now() - started).toBeLessThan(4000);
    expect(
      lines(result.stdout).some((event) => event.event === "timeout"),
    ).toBe(true);
  } finally {
    stub.server.stop(true);
  }
}, 15_000);
