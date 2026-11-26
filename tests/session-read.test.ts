import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { startCli, waitForExit } from "./stdio";
import { startSessionStub } from "./session-stub";

let root: string;
let inside: string;
let outside: string;
let prompt: string;

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), "oc2-read-"));
  inside = path.join(root, "inside");
  outside = mkdtempSync(path.join(tmpdir(), "oc2-outside-"));
  mkdirSync(inside);
  prompt = path.join(root, "prompt.txt");
  writeFileSync(prompt, "Read marker");
});
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

async function run(args: string[], env: Record<string, string> = {}) {
  return waitForExit(
    startCli(args, { ...env, OPENCODE_MCP_MODEL: "", OC2_MODEL: "" }),
  );
}

test("status, messages, and sessions return readable native JSON", async () => {
  const stub = startSessionStub();
  try {
    const session = stub.seed(inside, (info) => {
      info.title = "Listed";
      info.time.updated = Date.now() + 10;
    });
    await run(["send", session.id, "-f", prompt], {
      OPENCODE_MCP_URL: stub.url,
    });

    const status = await run(["status", session.id], {
      OPENCODE_MCP_URL: stub.url,
    });
    expect(status.code).toBe(0);
    expect(JSON.parse(status.stdout).id).toBe(session.id);

    const messages = await run(["messages", session.id, "--limit", "5"], {
      OPENCODE_MCP_URL: stub.url,
    });
    expect(messages.code).toBe(0);
    const page = JSON.parse(messages.stdout);
    expect(page.sessionID).toBe(session.id);
    expect(page.messages[0].id).toBe("msg_user_1");
    expect(page.cursor).not.toBeUndefined();

    const sessions = await run(["sessions", "--limit", "1"], {
      OPENCODE_MCP_URL: stub.url,
    });
    expect(sessions.code).toBe(0);
    expect(JSON.parse(sessions.stdout).sessions[0].id).toBe(session.id);
  } finally {
    stub.server.stop(true);
  }
});

test("model discovery falls back to the global catalogue for fresh dirs", async () => {
  const stub = startSessionStub({ emptyLocationModels: true });
  try {
    const result = await run(
      [
        "start",
        "-C",
        inside,
        "-f",
        prompt,
        "--model",
        "opencode-go/test-model#low",
      ],
      { OPENCODE_MCP_URL: stub.url },
    );
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).model.variant).toBe("low");
    expect(stub.creates).toBe(1);
  } finally {
    stub.server.stop(true);
  }
});

test("workspace scope admits model discovery only inside allowed dirs", async () => {
  const stub = startSessionStub();
  try {
    const allowed = await run(["start", "-C", inside, "-f", prompt], {
      OPENCODE_MCP_URL: stub.url,
      OPENCODE_MCP_ALLOWED_DIRS: inside,
    });
    expect(allowed.code).toBe(0);
    expect(stub.creates).toBe(1);

    const denied = await run(["start", "-C", outside, "-f", prompt], {
      OPENCODE_MCP_URL: stub.url,
      OPENCODE_MCP_ALLOWED_DIRS: inside,
    });
    expect(denied.code).toBe(1);
    expect(denied.stderr).toContain("Workspace scope");
    expect(stub.creates).toBe(1);
  } finally {
    stub.server.stop(true);
  }
});
