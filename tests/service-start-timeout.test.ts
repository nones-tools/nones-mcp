import { describe, expect, test } from "bun:test";
import { startService } from "../src/service-start";
import {
  failure,
  fakeClock,
  ready,
  recordingLauncher,
} from "./service-helpers";

describe("service start deadlines", () => {
  test("a timed-out launcher is not retried and can still become ready", async () => {
    let probes = 0;
    const { launcher, calls } = recordingLauncher({
      code: null,
      stdout: "",
      stderr: "",
      timedOut: true,
    });
    const result = await startService({
      env: {},
      opencodeBin: process.execPath,
      timeoutSeconds: 3,
      clock: fakeClock(),
      probe: async () => (++probes < 3 ? { ready: false } : ready("0.4.0")),
      launcher,
    });
    expect(result.nativeStartRequested).toBe(true);
    expect(result.mcpVersion).toBe("0.4.0");
    expect(calls).toHaveLength(1);
  });

  test("a timed-out launcher that never becomes ready reports once", async () => {
    const { launcher, calls } = recordingLauncher({
      code: null,
      stdout: "",
      stderr: "",
      timedOut: true,
    });
    const error = await failure(
      startService({
        env: {},
        opencodeBin: process.execPath,
        timeoutSeconds: 1,
        clock: fakeClock(),
        probe: async () => ({ ready: false }),
        launcher,
      }),
    );
    expect(error.code).toBe("native-start-timeout");
    expect(error.message).toContain("not retried");
    expect(calls).toHaveLength(1);
  });

  test("reports a sanitized MCP timeout after native success", async () => {
    const { launcher, calls } = recordingLauncher({
      code: 0,
      stdout: "",
      stderr: "",
      timedOut: false,
    });
    const error = await failure(
      startService({
        env: {},
        opencodeBin: process.execPath,
        timeoutSeconds: 1,
        clock: fakeClock(),
        probe: async () => ({ ready: false, detail: "tool token=private" }),
        launcher,
      }),
    );
    expect(error.code).toBe("mcp-timeout");
    expect(error.message).toContain("readiness timed out");
    expect(error.message).toContain("[redacted]");
    expect(error.message).not.toContain("private");
    expect(calls).toHaveLength(1);
  });

  test("abort cancels observation without launching", async () => {
    const controller = new AbortController();
    controller.abort();
    let launches = 0;
    const error = await failure(
      startService({
        env: {},
        signal: controller.signal,
        timeoutSeconds: 2,
        clock: fakeClock(),
        probe: async () => ready(),
        launcher: async () => {
          launches++;
          throw new Error("launcher must not run");
        },
      }),
    );
    expect(error.code).toBe("canceled");
    expect(launches).toBe(0);
  });
});
