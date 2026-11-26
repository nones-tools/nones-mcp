import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { classify, OpenCodeClient } from "./client.js";
import { groupHistory } from "./history.js";
const pathSchema = z.record(z.string(), z.string()).optional();
const querySchema = z.record(z.string(), z.unknown()).optional();
const params = z.object({
	path: pathSchema,
	query: querySchema,
	body: z.unknown().optional(),
	confirm: z.boolean().optional(),
});
const result = (data: unknown) => ({
	content: [{ type: "text" as const, text: JSON.stringify(data) }],
	structuredContent: { data },
});
const failure = (error: unknown) => ({
	content: [
		{
			type: "text" as const,
			text: error instanceof Error ? error.message : "Operation failed",
		},
	],
	isError: true,
});
export async function createServer(client: OpenCodeClient) {
	const server = new McpServer({ name: "opencode-mcp", version: "0.1.0" });
	const operations = await client.operations();
	server.registerTool(
		"opencode_operations",
		{
			description:
				"List supported safe-to-discover native OpenCode operations and their parameter metadata.",
			inputSchema: z.object({ filter: z.string().optional() }),
			annotations: { readOnlyHint: true, destructiveHint: false },
		},
		async ({ filter }) =>
			result(
				operations
					.filter((x) => !filter || x.id.includes(filter))
					.map((x) => ({ ...x, category: classify(x) })),
			),
	);
	server.registerTool(
		"opencode_request",
		{
			description:
				"Call an operation by exact OpenAPI operation ID. The server centrally enforces safety gates.",
			inputSchema: params.extend({ operation: z.string() }),
			annotations: { readOnlyHint: false, destructiveHint: true },
		},
		async (input, ctx) => {
			try {
				return result(await client.request(input, ctx.mcpReq.signal));
			} catch (e) {
				return failure(e);
			}
		},
	);
	server.registerTool(
		"opencode_history",
		{
			description:
				"Group a page of native messages by user prompt, including steering and assistant steps.",
			inputSchema: z.object({
				sessionID: z.string(),
				cursor: z.string().optional(),
				limit: z.number().int().min(1).max(200).optional(),
			}),
			annotations: { readOnlyHint: true, destructiveHint: false },
		},
		async (input, ctx) => {
			try {
				return result(
					groupHistory(
						await client.request(
							{
								operation: "session.message.list",
								path: { sessionID: input.sessionID },
								query: {
									...(input.cursor
										? { cursor: input.cursor }
										: { order: "asc" }),
									...(input.limit ? { limit: input.limit } : {}),
								},
							},
							ctx.mcpReq.signal,
						),
					),
				);
			} catch (e) {
				return failure(e);
			}
		},
	);
	server.registerTool(
		"opencode_events",
		{
			description:
				"Read bounded native session log or volatile global events. Global stream has no replay cursor.",
			inputSchema: z.object({
				sessionID: z.string().optional(),
				source: z.enum(["live", "log"]).optional(),
				types: z.array(z.string()).optional(),
				after: z.number().int().min(0).optional(),
				limit: z.number().int().min(1).max(200).optional(),
				durationMs: z.number().int().min(100).max(30000).optional(),
			}),
			annotations: { readOnlyHint: true, destructiveHint: false },
		},
		async (input, ctx) => {
			try {
				return result(await client.events(input, ctx.mcpReq.signal));
			} catch (e) {
				return failure(e);
			}
		},
	);
	for (const op of operations) {
		if (["event.subscribe", "experimental.session.log"].includes(op.id))
			continue;
		const category = classify(op);
		server.registerTool(
			`opencode_${op.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
			{
				description: `${op.description || op.id} (native operation ${op.id}). Path and query keys match the OpenAPI catalog.`,
				inputSchema: params,
				annotations: {
					readOnlyHint: category === "read",
					destructiveHint:
						category === "destructive" ||
						category === "admin" ||
						category === "exec",
				},
			},
			async (input, ctx) => {
				try {
					return result(
						await client.request(
							{ ...input, operation: op.id },
							ctx.mcpReq.signal,
						),
					);
				} catch (e) {
					return failure(e);
				}
			},
		);
	}
	return server;
}
