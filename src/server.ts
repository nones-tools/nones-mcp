import { McpServer } from "@modelcontextprotocol/server";
import { classify, OpenCodeClient } from "./client.js";
import { groupHistory } from "./history.js";
import {
	eventParams,
	historyParams,
	operationFilter,
	operationRequest,
	requestParams,
} from "./tool-schema.js";
import { toolFailure, toolResult } from "./tool-result.js";
import type { Operation } from "./types.js";

const streamOperations = ["event.subscribe", "experimental.session.log"];

type HistoryInput = {
	sessionID: string;
	cursor?: string;
	limit?: number;
};

class OpenCodeTools {
	private server = new McpServer({
		name: "opencode-mcp",
		version: "0.1.1",
	});

	constructor(
		private client: OpenCodeClient,
		private operations: Operation[],
	) {}

	register(): McpServer {
		this.registerCatalog();
		this.registerRequest();
		this.registerHistory();
		this.registerEvents();
		for (const operation of this.operations)
			if (!streamOperations.includes(operation.id))
				this.registerOperation(operation);
		return this.server;
	}

	private registerCatalog(): void {
		this.server.registerTool(
			"opencode_operations",
			{
				description:
					"List supported safe-to-discover native OpenCode operations and their parameter metadata.",
				inputSchema: operationFilter,
				annotations: {
					readOnlyHint: true,
					destructiveHint: false,
				},
			},
			async ({ filter }) =>
				toolResult(
					this.operations
						.filter((op) => !filter || op.id.includes(filter))
						.map((op) => ({
							...op,
							category: classify(op),
						})),
				),
		);
	}

	private registerRequest(): void {
		this.server.registerTool(
			"opencode_request",
			{
				description:
					"Call an operation by exact OpenAPI operation ID. The server centrally enforces safety gates.",
				inputSchema: operationRequest,
				annotations: {
					readOnlyHint: false,
					destructiveHint: true,
				},
			},
			async (input, ctx) =>
				this.respond(() => this.client.request(input, ctx.mcpReq.signal)),
		);
	}

	private registerHistory(): void {
		this.server.registerTool(
			"opencode_history",
			{
				description:
					"Group a page of native messages by user prompt, including steering and assistant steps.",
				inputSchema: historyParams,
				annotations: {
					readOnlyHint: true,
					destructiveHint: false,
				},
			},
			async (input, ctx) =>
				this.respond(() => this.history(input, ctx.mcpReq.signal)),
		);
	}

	private registerEvents(): void {
		this.server.registerTool(
			"opencode_events",
			{
				description:
					"Read bounded native session log or volatile global events. Global stream has no replay cursor.",
				inputSchema: eventParams,
				annotations: {
					readOnlyHint: true,
					destructiveHint: false,
				},
			},
			async (input, ctx) =>
				this.respond(() => this.client.events(input, ctx.mcpReq.signal)),
		);
	}

	private registerOperation(op: Operation): void {
		const category = classify(op);
		this.server.registerTool(
			`opencode_${op.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
			{
				description: `${op.description || op.id} (native operation ${op.id}). Path and query keys match the OpenAPI catalog.`,
				inputSchema: requestParams,
				annotations: {
					readOnlyHint: category === "read",
					destructiveHint:
						category === "destructive" ||
						category === "admin" ||
						category === "exec",
				},
			},
			async (input, ctx) =>
				this.respond(() =>
					this.client.request(
						{ ...input, operation: op.id },
						ctx.mcpReq.signal,
					),
				),
		);
	}

	private history(input: HistoryInput, signal?: AbortSignal) {
		return this.client
			.request(
				{
					operation: "session.message.list",
					path: { sessionID: input.sessionID },
					query: {
						...(input.cursor ? { cursor: input.cursor } : { order: "asc" }),
						...(input.limit ? { limit: input.limit } : {}),
					},
				},
				signal,
			)
			.then(groupHistory);
	}

	private async respond(run: () => unknown | Promise<unknown>) {
		try {
			return toolResult(await run());
		} catch (error) {
			return toolFailure(error);
		}
	}
}

export async function createServer(client: OpenCodeClient) {
	const operations = await client.operations();
	return new OpenCodeTools(client, operations).register();
}
