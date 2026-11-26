import { afterAll, beforeAll, expect, test } from "bun:test";
import { startCli, waitForExit } from "./stdio.js";
import { startStub } from "./stub.js";

let stub: ReturnType<typeof startStub>;
let url: string;

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
