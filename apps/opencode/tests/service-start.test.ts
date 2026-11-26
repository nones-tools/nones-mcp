import { describe, expect, test } from "bun:test";
import { startService } from "../src/service-start";
import {
  failure,
  fakeClock,
  ready,
  recordingLauncher,
} from "./service-helpers";

describe("service start", () => {
  test("reuses a healthy managed service without launching", async () => {
    let launches = 0;
    let probes = 0;
    const result = await startService({
      env: {},
      timeoutSeconds: 2,
      clock: fakeClock(),
      probe: async () => {
        probes++;
        return ready("0.3.0");
      },
      launcher: async () => {
        launches++;
        throw new Error("launcher must not run");
      },
    });
    expect(result).toMatchObject({
      status: "ready",
      source: "managed",
      nativeStartRequested: false,
      mcpVersion: "0.3.0",
    });
    expect(probes).toBe(1);
    expect(launches).toBe(0);
  });

  test("starts natively and waits for delayed readiness", async () => {
    let probes = 0;
    const { launcher, calls } = recordingLauncher({
      code: 0,
      stdout: "",
      stderr: "",
      timedOut: false,
      pid: 4321,
    });
    const secret = "super-secret";
    const result = await startService({
      env: { OPENCODE_MCP_PASSWORD: secret },
      opencodeBin: process.execPath,
      timeoutSeconds: 5,
      clock: fakeClock(),
      probe: async () =>
        ++probes < 4 ? { ready: false, detail: "not yet" } : ready("0.4.0"),
      launcher,
    });
    expect(result).toMatchObject({
      source: "managed",
      nativeStartRequested: true,
      mcpVersion: "0.4.0",
    });
    expect(probes).toBeGreaterThanOrEqual(4);
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual(["service", "start"]);
    expect(calls[0].command).toBe(process.execPath);
    expect(JSON.stringify(calls[0].args)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  test("explicit endpoints are observed and never spawned", async () => {
    let launches = 0;
    let probes = 0;
    const result = await startService({
      env: {
        OPENCODE_MCP_URL: "http://127.0.0.1:1",
        OPENCODE_MCP_PASSWORD: "super-secret",
      },
      timeoutSeconds: 2,
      clock: fakeClock(),
      probe: async () => (++probes < 2 ? { ready: false } : ready("0.4.0")),
      launcher: async () => {
        launches++;
        throw new Error("launcher must not run");
      },
    });
    expect(result).toMatchObject({
      source: "explicit",
      nativeStartRequested: false,
      mcpVersion: "0.4.0",
    });
    expect(probes).toBe(2);
    expect(launches).toBe(0);
    expect(JSON.stringify(result)).not.toContain("super-secret");
  });

  test("reports a missing executable without launching", async () => {
    let launches = 0;
    const error = await failure(
      startService({
        env: { PATH: "" },
        timeoutSeconds: 2,
        clock: fakeClock(),
        probe: async () => ({ ready: false }),
        launcher: async () => {
          launches++;
          throw new Error("launcher must not run");
        },
      }),
    );
    expect(error.code).toBe("missing-executable");
    expect(error.message).toContain("opencode2");
    expect(error.message).toContain("OPENCODE_MCP_OPENCODE_BIN");
    expect(launches).toBe(0);
  });

  test("does not echo native output on a nonzero failure", async () => {
    const secret = "super-secret";
    const { launcher, calls } = recordingLauncher({
      code: 2,
      stdout: "",
      stderr: `start failed OPENCODE_MCP_PASSWORD=${secret}`,
      timedOut: false,
    });
    const error = await failure(
      startService({
        env: { OPENCODE_MCP_PASSWORD: secret },
        opencodeBin: process.execPath,
        timeoutSeconds: 2,
        clock: fakeClock(),
        probe: async () => ({ ready: false }),
        launcher,
      }),
    );
    expect(error.code).toBe("native-start-failed");
    expect(error.message).toContain("exited with code 2");
    expect(error.message).toContain("opencode2 service status");
    expect(error.message).not.toContain("start failed");
    expect(error.message).not.toContain(secret);
    expect(calls).toHaveLength(1);
  });
});
