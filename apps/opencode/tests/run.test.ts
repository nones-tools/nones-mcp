import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { startSessionStub } from "./session-stub";
import { startCli, waitForExit } from "./stdio";

let root: string;
let prompt: string;

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), "oc2-run-"));
  prompt = path.join(root, "prompt.txt");
  writeFileSync(prompt, "Run marker");
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

test("run emits the session promptly and reconciles a fast completion", async () => {
  const stub = startSessionStub({ auto: true });
  try {
    const result = await waitForExit(
      startCli(["run", "-C", root, "-f", prompt, "--timeout", "10"], {
        OPENCODE_MCP_URL: stub.url,
        OPENCODE_MCP_MODEL: "",
        OC2_MODEL: "",
      }),
      10_000,
    );
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    const events = result.stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(events[0]).toMatchObject({
      event: "started",
      sessionID: "ses_test_1",
    });
    expect(events[0].receipt.delivery).toBe("steer");
    expect(events.some((event) => event.event === "success")).toBe(true);
  } finally {
    stub.server.stop(true);
  }
}, 15_000);
