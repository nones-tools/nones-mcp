#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { OpenCodeClient } from "./client.js";
import { formatJson } from "./json.js";
import { createServer } from "./server.js";

class Cli {
	constructor(private command: string) {}

	async run(): Promise<void> {
		if (
			this.command === "help" ||
			this.command === "--help" ||
			this.command === "-h"
		) {
			console.log("Usage: opencode-mcp [mcp|doctor|help]");
			return;
		}
		if (this.command !== "mcp" && this.command !== "doctor") {
			console.error("Unknown command; use help");
			process.exitCode = 1;
			return;
		}
		try {
			const client = await OpenCodeClient.connect();
			if (this.command === "doctor") await this.doctor(client);
			else {
				const server = await createServer(client);
				await server.connect(new StdioServerTransport());
			}
		} catch (error) {
			console.error(
				error instanceof Error
					? error.message
					: "OpenCode initialization failed",
			);
			process.exitCode = 1;
		}
	}

	private async doctor(client: OpenCodeClient): Promise<void> {
		const operations = await client.operations();
		const info = await client.request({ operation: "server.info" });
		console.log(
			formatJson({
				healthy: true,
				info,
				operations: operations.length,
			}),
		);
	}
}

await new Cli(process.argv[2] || "mcp").run();
