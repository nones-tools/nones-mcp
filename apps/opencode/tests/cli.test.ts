import { afterAll, beforeAll, expect, test } from "bun:test";
import { startCli, waitForExit } from "./stdio";
import { startStub } from "./stub";

let stub: ReturnType<typeof startStub>;
let url: string;
const unavailable = "http://127.0.0.1:1";

beforeAll(() => {
  stub = startStub();
  url = stub.url;
});
afterAll(() => stub.server.stop(true));

test("doctor prints pretty health JSON", async () => {
  const child = startCli("doctor", { OPENCODE_MCP_URL: url });
  const result = await waitForExit(child);
  expect(result.code).toBe(0);
  const health = JSON.parse(result.stdout);
  expect(health.healthy).toBe(true);
  expect(health.operations).toBeGreaterThan(0);
  expect(result.stdout).toContain('\n  "healthy": true');
  expect(result.stderr).toBe("");
});

test("help aliases list both commands without a service", async () => {
  for (const args of [["--help"], ["-h"], ["help"]]) {
    const result = await waitForExit(
      startCli(args, { OPENCODE_MCP_URL: unavailable }),
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage: opencode-mcp");
    expect(result.stdout).toContain("mcp");
    expect(result.stdout).toContain("doctor");
    expect(result.stdout).toContain("start");
    expect(result.stdout).toContain("monitor");
    expect(result.stderr).toBe("");
  }
}, 15000);

test("command help explains each command", async () => {
  const cases = [
    { args: ["help", "doctor"], text: "check the OpenCode connection" },
    { args: ["doctor", "--help"], text: "credentials are never included" },
    { args: ["mcp", "--help"], text: "stdout carries JSON-RPC messages only" },
    { args: ["help", "start"], text: "opencode-mcp start -C" },
    { args: ["send", "--help"], text: "does not wait for a turn" },
    { args: ["monitor", "--help"], text: "Exit codes: 0 success" },
    { args: ["watch", "--help"], text: "newline-delimited JSON" },
    { args: ["run", "--help"], text: "started line" },
    { args: ["sessions", "--help"], text: "sessions --limit" },
  ];
  for (const { args, text } of cases) {
    const result = await waitForExit(
      startCli(args, { OPENCODE_MCP_URL: unavailable }),
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(text);
    expect(result.stderr).toBe("");
  }
}, 15000);

test("version flags report the package version", async () => {
  for (const args of [["--version"], ["-V"]]) {
    const result = await waitForExit(
      startCli(args, { OPENCODE_MCP_URL: unavailable }),
    );
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe("0.5.0");
    expect(result.stderr).toBe("");
  }
}, 15000);

test("invalid commands and flags fail without connecting", async () => {
  const before = stub.requests;
  const command = await waitForExit(
    startCli(["bogus"], { OPENCODE_MCP_URL: url }),
  );
  expect(command.code).toBe(1);
  expect(command.stderr).toContain("unknown command");
  expect(command.stderr).toContain("bogus");
  expect(command.stdout).toBe("");

  const flag = await waitForExit(
    startCli(["--bogus"], { OPENCODE_MCP_URL: url }),
  );
  expect(flag.code).toBe(1);
  expect(flag.stderr).toContain("unknown option");
  expect(flag.stderr).toContain("--bogus");
  expect(flag.stdout).toBe("");
  expect(stub.requests).toBe(before);
}, 15000);
