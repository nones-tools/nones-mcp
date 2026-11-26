import { beforeAll, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { packageFixture, type PackageFixture } from "./package-fixture";
import { startSessionStub } from "./session-stub";
import { startCli, waitForMessages } from "./stdio";

let fixture: PackageFixture;
let stub: ReturnType<typeof startSessionStub>;

beforeAll(async () => {
  fixture = await packageFixture();
  stub = startSessionStub();
}, 180_000);

test("the installed build runs under Bun with a bounded MCP handshake", async () => {
  const bun = Bun.which("bun") ?? process.execPath;
  const cli = path.join(fixture.packageDir, "dist", "cli.js");
  const version = execFileSync(bun, ["--no-env-file", cli, "--version"], {
    encoding: "utf8",
  });
  expect(version.trim()).toBe("0.3.0");

  const child = startCli(
    [],
    { OPENCODE_MCP_URL: stub.url },
    { executable: bun, prefix: ["--no-env-file"], cli },
  );
  const send = (message: unknown) =>
    child.stdin?.write(`${JSON.stringify(message)}\n`);
  send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "bun-smoke", version: "1" },
    },
  });
  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const messages = await waitForMessages(
    child,
    (all) =>
      all.some((message) => message.id === 1) &&
      all.some((message) => message.id === 2),
  );
  child.kill();
  expect(
    messages.find((message) => message.id === 1)?.result.serverInfo.version,
  ).toBe("0.3.0");
  expect(
    JSON.stringify(messages.find((message) => message.id === 2)?.result),
  ).toContain("opencode_server_info");
}, 20_000);
