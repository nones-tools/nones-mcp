import { afterAll, beforeAll, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { startCli, waitForExit } from "./stdio";
import { startSessionStub } from "./session-stub";

let root: string;
let inside: string;
let prompt: string;

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), "oc2-session-"));
  inside = path.join(root, "inside");
  mkdirSync(inside);
  prompt = path.join(root, "prompt.txt");
  writeFileSync(prompt, "Please verify the marker.\n");
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

async function run(args: string[], env: Record<string, string> = {}) {
  return waitForExit(
    startCli(args, {
      OPENCODE_MCP_MODEL: "",
      OC2_MODEL: "",
      ...env,
    }),
  );
}

test("start creates a native session and returns the steer receipt", async () => {
  const stub = startSessionStub();
  try {
    const result = await run(
      [
        "start",
        "-C",
        inside,
        "-f",
        prompt,
        "--model",
        "opencode-go/test-model#high",
        "--title",
        "Session test",
      ],
      { OPENCODE_MCP_URL: stub.url },
    );
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    const output = JSON.parse(result.stdout);
    expect(output.sessionID).toBe("ses_test_1");
    expect(output.directory).toBe(realpathSync(inside));
    expect(output.model).toEqual({
      providerID: "opencode-go",
      id: "test-model",
      variant: "high",
    });
    expect(output.receipt.id).toBe("msg_user_1");
    expect(output.receipt.delivery).toBe("steer");
    expect(stub.creates).toBe(1);
    expect(stub.lastPrompt?.body).toEqual({
      text: "Please verify the marker.\n",
      delivery: "steer",
    });
  } finally {
    stub.server.stop(true);
  }
});

test("start reads stdin and resolves env models without fallback", async () => {
  const stub = startSessionStub();
  try {
    const child = startCli(["start", "-C", inside, "-f", "-"], {
      OPENCODE_MCP_URL: stub.url,
      OPENCODE_MCP_MODEL: "opencode-go/test-model#low",
      OC2_MODEL: "opencode-go/test-model#max",
    });
    child.stdin?.write("stdin marker");
    child.stdin?.end();
    const result = await waitForExit(child);
    expect(result.code).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.model.variant).toBe("low");
    expect(output.modelSource).toBe("OPENCODE_MCP_MODEL");

    const legacy = await run(["start", "-C", inside, "-f", prompt], {
      OPENCODE_MCP_URL: stub.url,
      OC2_MODEL: "opencode-go/test-model#max",
    });
    expect(JSON.parse(legacy.stdout).model.variant).toBe("max");
    expect(JSON.parse(legacy.stdout).modelSource).toBe("OC2_MODEL");
  } finally {
    stub.server.stop(true);
  }
});

test("invalid prompt, model, and variant fail before session creation", async () => {
  const stub = startSessionStub();
  try {
    const cases = [
      ["start", "-C", inside, "-f", path.join(root, "missing.txt")],
      ["start", "-C", inside, "-f", prompt, "--model", " "],
      ["start", "-C", inside, "-f", prompt, "--model", "opencode-go/nope"],
      [
        "start",
        "-C",
        inside,
        "-f",
        prompt,
        "--model",
        "opencode-go/test-model#ultra",
      ],
    ];
    for (const args of cases) {
      const result = await run(args, { OPENCODE_MCP_URL: stub.url });
      expect(result.code).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr.length).toBeGreaterThan(0);
    }
    expect(stub.creates).toBe(0);

    const envModel = await run(["start", "-C", inside, "-f", prompt], {
      OPENCODE_MCP_URL: stub.url,
      OPENCODE_MCP_MODEL: "opencode-go/nope",
    });
    expect(envModel.code).toBe(1);
    expect(stub.creates).toBe(0);
  } finally {
    stub.server.stop(true);
  }
});

test("submission failure keeps the created session ID in diagnostics", async () => {
  const stub = startSessionStub({ failPrompts: 1 });
  try {
    const result = await run(["start", "-C", inside, "-f", prompt], {
      OPENCODE_MCP_URL: stub.url,
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("ses_test_1");
    expect(result.stderr).toContain("created but prompt submission failed");
  } finally {
    stub.server.stop(true);
  }
});

test("send reuses the session and honors steer and queue", async () => {
  const stub = startSessionStub();
  try {
    const session = stub.seed(inside);
    const steer = await run(["send", session.id, "-f", prompt], {
      OPENCODE_MCP_URL: stub.url,
    });
    expect(steer.code).toBe(0);
    expect(JSON.parse(steer.stdout).sessionID).toBe(session.id);
    expect(JSON.parse(steer.stdout).delivery).toBe("steer");
    expect(stub.creates).toBe(0);

    const child = startCli(
      ["send", session.id, "-f", "-", "--delivery", "queue"],
      { OPENCODE_MCP_URL: stub.url },
    );
    child.stdin?.write("queued marker");
    child.stdin?.end();
    const queued = await waitForExit(child);
    expect(queued.code).toBe(0);
    expect(JSON.parse(queued.stdout).receipt.delivery).toBe("queue");
    expect(stub.prompts).toBe(2);
    expect(stub.lastPrompt?.body.delivery).toBe("queue");
  } finally {
    stub.server.stop(true);
  }
});
