import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { OpenCodeClient, classify, sanitize } from "../src/client.js";
import { groupHistory } from "../src/history.js";
let server: ReturnType<typeof Bun.serve>;
let url: string;
beforeAll(() => {
	server = Bun.serve({
		port: 0,
		fetch(req) {
			const u = new URL(req.url);
			if (u.pathname === "/openapi.json")
				return Response.json({
					paths: {
						"/api/session/{sessionID}/prompt": {
							post: {
								operationId: "session.prompt",
								parameters: [{ name: "sessionID", in: "path", required: true }],
							},
						},
						"/api/session/{sessionID}": {
							delete: {
								operationId: "session.remove",
								parameters: [{ name: "sessionID", in: "path", required: true }],
							},
						},
						"/auth/connect/{code}": { get: { operationId: "server.connect" } },
					},
				});
			if (u.pathname === "/api/event")
				return new Response(
					'event: session.idle\ndata: {"type":"session.idle","password":"private"}\n\n',
					{ headers: { "content-type": "text/event-stream" } },
				);
			return Response.json({
				path: u.pathname,
				method: req.method,
				password: "private",
			});
		},
	});
	url = `http://127.0.0.1:${server.port}`;
});
afterAll(() => server.stop(true));
describe("client", () => {
	test("routes IDs safely and filters secrets and auth operations", async () => {
		const c = await OpenCodeClient.connect({ OPENCODE_MCP_URL: url });
		expect((await c.operations()).map((x) => x.id)).not.toContain(
			"server.connect",
		);
		expect(
			await c.request({
				operation: "session.prompt",
				path: { sessionID: "id ?" },
				body: { text: "hello" },
			}),
		).toEqual({ path: "/api/session/id%20%3F/prompt", method: "POST" });
		expect(
			c.request({
				operation: "session.prompt",
				path: { sessionID: "../other" },
			}),
		).rejects.toThrow();
	});
	test("destructive access needs both gate and confirmation", async () => {
		const c = await OpenCodeClient.connect({
			OPENCODE_MCP_URL: url,
			OPENCODE_MCP_ALLOW_DESTRUCTIVE: "1",
		});
		expect(
			c.request({ operation: "session.remove", path: { sessionID: "x" } }),
		).rejects.toThrow("confirm");
		expect(
			(
				await c.request({
					operation: "session.remove",
					path: { sessionID: "x" },
					confirm: true,
				})
			).method,
		).toBe("DELETE");
	});
	test("filters events and rejects unsupported global cursor", async () => {
		const c = await OpenCodeClient.connect({ OPENCODE_MCP_URL: url });
		const result = await c.events({ types: ["session.idle"], durationMs: 100 });
		expect(result.events).toHaveLength(1);
		expect(JSON.stringify(result)).not.toContain("private");
		expect(c.events({ source: "live", after: 1 })).rejects.toThrow("cursor");
	});
	test("redacts recursively and classifies writes", () => {
		expect(sanitize({ data: { accessToken: "private", other: "ok" } })).toEqual(
			{ data: { other: "ok" } },
		);
		expect(
			classify({
				id: "session.shell",
				method: "POST",
				path: "",
				parameters: [],
			}),
		).toBe("exec");
	});
});
test("groups steering and terminal separately", () => {
	const result = groupHistory({
		data: [
			{ id: "u1", type: "user" },
			{ id: "a", type: "assistant", parts: [{ type: "tool", output: "ok" }] },
			{ id: "u2", type: "user" },
			{ id: "a2", type: "assistant" },
			{ type: "idle" },
		],
		cursor: { next: null },
	});
	expect(result.groups).toHaveLength(2);
	expect(result.groups[0].steps[0].parts[0].output).toBe("ok");
	expect(result.groups[1].terminal.type).toBe("idle");
});
test("Node stdio MCP initializes and lists tools", async () => {
	const child = spawn(
		"node",
		[process.env.OPENCODE_MCP_TEST_CLI || "dist/cli.js", "mcp"],
		{
			env: { ...process.env, OPENCODE_MCP_URL: url },
			stdio: ["pipe", "pipe", "pipe"],
		},
	);
	let buffer = "";
	child.stdout.on("data", (x) => (buffer += x.toString()));
	child.stdin.write(
		JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: {
				protocolVersion: "2025-06-18",
				capabilities: {},
				clientInfo: { name: "test", version: "1" },
			},
		}) + "\n",
	);
	child.stdin.write(
		JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) +
			"\n",
	);
	child.stdin.write(
		JSON.stringify({
			jsonrpc: "2.0",
			id: 2,
			method: "tools/list",
			params: {},
		}) + "\n",
	);
	child.stdin.write(
		JSON.stringify({
			jsonrpc: "2.0",
			id: 3,
			method: "tools/call",
			params: {
				name: "opencode_session_prompt",
				arguments: { path: { sessionID: "test" }, body: { text: "test" } },
			},
		}) + "\n",
	);
	await new Promise((resolve) => setTimeout(resolve, 1000));
	child.kill();
	expect(buffer).toContain("opencode_session_prompt");
	expect(buffer).toContain('"id":1');
	expect(buffer).toContain('"id":3');
	expect(buffer).toContain("structuredContent");
});
