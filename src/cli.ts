#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { OpenCodeClient } from "./client.js";
import { createServer } from "./server.js";
const command = process.argv[2] || "mcp";
if (command === "help" || command === "--help" || command === "-h") {
	console.log("Usage: opencode-mcp [mcp|doctor|help]");
} else if (command === "mcp" || command === "doctor") {
	try {
		const client = await OpenCodeClient.connect();
		if (command === "doctor") {
			const ops = await client.operations();
			const info = await client.request({ operation: "server.info" });
			console.log(
				JSON.stringify({ healthy: true, info, operations: ops.length }),
			);
		} else {
			const server = await createServer(client);
			await server.connect(new StdioServerTransport());
		}
	} catch (e) {
		console.error(
			e instanceof Error ? e.message : "OpenCode initialization failed",
		);
		process.exitCode = 1;
	}
} else {
	console.error("Unknown command; use help");
	process.exitCode = 1;
}
