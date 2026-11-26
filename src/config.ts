import { Service } from "@opencode/client/service";
import { realpath } from "node:fs/promises";
import path from "node:path";

type Endpoint = {
	url: string;
	auth?: { type: "basic"; username: string; password: string };
};

export type Connection = {
	base: URL;
	headers: HeadersInit;
	timeout: number;
	allowed: string[];
	env: NodeJS.ProcessEnv;
};

/** Discover an endpoint once so every client module shares validated settings. */
export async function resolveConnection(
	env: NodeJS.ProcessEnv = process.env,
): Promise<Connection> {
	let endpoint: Endpoint;
	if (env.OPENCODE_MCP_URL)
		endpoint = {
			url: env.OPENCODE_MCP_URL,
			auth: env.OPENCODE_MCP_PASSWORD
				? {
						type: "basic",
						username: "opencode",
						password: env.OPENCODE_MCP_PASSWORD,
					}
				: undefined,
		};
	else {
		let discovered: Awaited<ReturnType<typeof Service.discover>>;
		for (let attempt = 0; attempt < 3 && !discovered; attempt++) {
			discovered = await Service.discover(
				env.OPENCODE_MCP_SERVICE_FILE
					? { file: env.OPENCODE_MCP_SERVICE_FILE }
					: undefined,
			);
			if (!discovered && attempt < 2)
				await new Promise((resolve) => setTimeout(resolve, 150));
		}
		if (!discovered) throw new Error("OpenCode service not found");
		endpoint = discovered;
	}
	let base: URL;
	try {
		base = new URL(endpoint.url);
	} catch {
		throw new Error("Invalid endpoint");
	}
	if (
		base.username ||
		base.password ||
		base.search ||
		base.hash ||
		base.pathname !== "/"
	)
		throw new Error("Invalid endpoint");
	const local = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
	if (
		!["http:", "https:"].includes(base.protocol) ||
		(!local &&
			(env.OPENCODE_MCP_ALLOW_REMOTE !== "1" || base.protocol !== "https:"))
	)
		throw new Error(
			"Remote endpoint requires HTTPS and OPENCODE_MCP_ALLOW_REMOTE=1",
		);
	const timeout = Number(env.OPENCODE_MCP_TIMEOUT_MS || 30000);
	if (!Number.isInteger(timeout) || timeout < 100 || timeout > 120000)
		throw new Error("Invalid timeout");
	const allowed = await Promise.all(
		(env.OPENCODE_MCP_ALLOWED_DIRS || "")
			.split(path.delimiter)
			.filter(Boolean)
			.map((directory) => realpath(directory)),
	);
	return {
		base,
		headers: Service.headers(endpoint) || {},
		timeout,
		allowed,
		env,
	};
}
