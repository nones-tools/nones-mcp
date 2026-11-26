import { Service } from "@opencode/client/service";
import { realpath } from "node:fs/promises";
import path from "node:path";

export type Operation = {
	id: string;
	method: string;
	path: string;
	parameters: Array<{ name: string; in: string; required?: boolean }>;
	description?: string;
};
type Catalog = { paths: Record<string, Record<string, any>> };
export type Request = {
	operation: string;
	path?: Record<string, string>;
	query?: Record<string, unknown>;
	body?: unknown;
	confirm?: boolean;
};
const bannedRoute =
	/(?:credential|password|secret|token|authorization|cookie|api.?key|pair|auth|connect|rpc)/i;
const sensitiveKey =
	/(?:password|secret|(?:^|[_-])token$|(?:access|refresh|id|auth)token$|authorization|cookie|api_?key|private_?key|credential)/i;
const safeWrites = new Set([
	"session.create",
	"session.update",
	"session.fork",
	"session.switchAgent",
	"session.switchModel",
	"session.prompt",
	"session.compact",
	"session.interrupt",
	"session.inbox.update",
	"session.inbox.cancel",
	"experimental.session.skill",
	"session.form.reply",
	"permission.reply",
	"experimental.session.wait",
]);
const exec = /(?:shell|pty|terminal|command|execute)/i;
const destructive =
	/(?:remove|delete|revert|commit|filesystem|(?:file|fs)\.(?:write|delete))/i;
export function sanitize(value: unknown): any {
	if (Array.isArray(value)) return value.map(sanitize);
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.entries(value)
				.filter(([k]) => !sensitiveKey.test(k))
				.map(([k, v]) => [k, sanitize(v)]),
		);
	if (typeof value === "string")
		return value.replace(/https?:\/\/[^\s/@]+:[^\s/@]+@/g, "[redacted-url]");
	return value;
}
export function classify(
	op: Operation,
): "read" | "write" | "admin" | "exec" | "destructive" {
	if (op.method === "GET") return "read";
	if (exec.test(op.id)) return "exec";
	if (destructive.test(op.id) || op.method === "DELETE") return "destructive";
	if (safeWrites.has(op.id)) return "write";
	return "admin";
}
export class OpenCodeClient {
	private catalog?: Operation[];
	private constructor(
		private base: URL,
		private headers: HeadersInit,
		private timeout: number,
		private allowed: string[],
		private env: NodeJS.ProcessEnv,
	) {}
	static async connect(
		env: NodeJS.ProcessEnv = process.env,
	): Promise<OpenCodeClient> {
		let endpoint: {
			url: string;
			auth?: { type: "basic"; username: string; password: string };
		};
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
				.map((p) => realpath(p)),
		);
		return new OpenCodeClient(
			base,
			Service.headers(endpoint) || {},
			timeout,
			allowed,
			env,
		);
	}
	private async fetch(
		pathname: string,
		init: RequestInit = {},
		signal?: AbortSignal,
	): Promise<Response> {
		if (
			!pathname.startsWith("/") ||
			pathname.startsWith("//") ||
			pathname.includes("\\")
		)
			throw new Error("Invalid upstream route");
		const target = new URL(pathname, this.base);
		if (target.origin !== this.base.origin)
			throw new Error("Invalid upstream origin");
		const abort = AbortSignal.timeout(this.timeout);
		const combined = signal ? AbortSignal.any([signal, abort]) : abort;
		try {
			return await fetch(target, {
				...init,
				headers: {
					...Object.fromEntries(new Headers(this.headers)),
					...Object.fromEntries(new Headers(init.headers)),
				},
				redirect: "error",
				signal: combined,
			});
		} catch {
			if (combined.aborted)
				throw new Error(
					"Request timed out or cancelled; mutation outcome may be unknown",
				);
			throw new Error("OpenCode connection failed");
		}
	}
	private async read(response: Response): Promise<any> {
		if (!response.ok)
			throw new Error(
				response.status === 404
					? "Resource or session not found"
					: response.status === 401 || response.status === 403
						? "Insufficient access"
						: `OpenCode request failed (HTTP ${response.status})`,
			);
		const len = Number(response.headers.get("content-length") || 0);
		if (len > 2_000_000) throw new Error("Response exceeds size limit");
		const reader = response.body?.getReader();
		if (!reader) return null;
		let n = 0;
		const chunks: Uint8Array[] = [];
		while (true) {
			const r = await reader.read();
			if (r.done) break;
			n += r.value.length;
			if (n > 2_000_000) {
				await reader.cancel();
				throw new Error("Response exceeds size limit");
			}
			chunks.push(r.value);
		}
		try {
			return sanitize(JSON.parse(Buffer.concat(chunks).toString("utf8")));
		} catch {
			throw new Error("Invalid upstream JSON response");
		}
	}
	async operations(signal?: AbortSignal): Promise<Operation[]> {
		if (this.catalog) return this.catalog;
		const data = (await this.read(
			await this.fetch("/openapi.json", {}, signal),
		)) as Catalog;
		this.catalog = Object.entries(data.paths).flatMap(([p, methods]) =>
			!/^\/(?!\/)[A-Za-z0-9_{}\-/]+$/.test(p) ||
			p.split("/").some((x) => x === "." || x === "..")
				? []
				: Object.entries(methods)
						.filter(
							([m, v]) =>
								["get", "post", "patch", "put", "delete"].includes(m) &&
								v.operationId &&
								!bannedRoute.test(v.operationId) &&
								!bannedRoute.test(p),
						)
						.map(([method, v]) => ({
							id: v.operationId,
							method: method.toUpperCase(),
							path: p,
							parameters: v.parameters || [],
							description: v.summary,
						})),
		);
		return this.catalog;
	}
	async request(input: Request, signal?: AbortSignal): Promise<any> {
		const op = (await this.operations(signal)).find(
			(x) => x.id === input.operation,
		);
		if (!op) throw new Error("Unsupported operation");
		if (op.id === "event.subscribe" || op.id === "experimental.session.log")
			throw new Error("Use the events tool for streams");
		const category = classify(op);
		const flag = {
			admin: "OPENCODE_MCP_ALLOW_ADMIN",
			exec: "OPENCODE_MCP_ALLOW_EXEC",
			destructive: "OPENCODE_MCP_ALLOW_DESTRUCTIVE",
		} as const;
		if (
			category !== "read" &&
			category !== "write" &&
			(this.env[flag[category]] !== "1" || input.confirm !== true)
		)
			throw new Error(
				`Operation requires ${flag[category]}=1 and confirm=true`,
			);
		if (this.allowed.length) {
			const sessionID = input.path?.sessionID;
			if (op.id === "session.create") {
				const body = input.body as
					| { location?: { directory?: unknown }; parentID?: unknown }
					| undefined;
				if (!(await this.isAllowed(body?.location?.directory)))
					throw new Error(
						"Workspace scope cannot be verified for session creation",
					);
				if (body?.parentID != null) {
					if (typeof body.parentID !== "string")
						throw new Error("Invalid parent ID");
					await this.checkSession(body.parentID, signal);
				}
			}
			if (
				!sessionID &&
				![
					"session.list",
					"project.list",
					"session.create",
					"server.info",
				].includes(op.id)
			)
				throw new Error(
					"Workspace scope cannot be verified for this operation",
				);
			if (
				sessionID &&
				!op.id.startsWith("session.") &&
				!op.id.startsWith("experimental.session.")
			)
				throw new Error(
					"Workspace scope cannot be verified for this operation",
				);
			if (["session.move", "session.fork"].includes(op.id))
				throw new Error(
					"Workspace scope cannot be verified for this operation",
				);
			if (sessionID) await this.checkSession(sessionID, signal);
		}
		const params = input.path || {};
		const query = input.query || {};
		const knownPath = op.parameters
			.filter((p) => p.in === "path")
			.map((p) => p.name);
		const knownQuery = op.parameters
			.filter((p) => p.in === "query")
			.map((p) => p.name);
		if (
			Object.keys(params).some((k) => !knownPath.includes(k)) ||
			Object.keys(query).some((k) => !knownQuery.includes(k))
		)
			throw new Error("Unknown parameter");
		let route = op.path.replace(/\{([^}]+)\}/g, (_, key: string) => {
			const v = params[key];
			if (!v || v === "." || v === ".." || /[\\/]/.test(v))
				throw new Error("Invalid path parameter");
			return encodeURIComponent(v);
		});
		const q = new URLSearchParams();
		const append = (key: string, value: unknown): void => {
			if (Array.isArray(value)) {
				for (const x of value) append(key, x);
			} else if (value !== null && typeof value === "object") {
				for (const [k, v] of Object.entries(value)) append(`${key}[${k}]`, v);
			} else if (["string", "number", "boolean"].includes(typeof value))
				q.append(key, String(value));
			else throw new Error("Invalid query parameter");
		};
		for (const [k, v] of Object.entries(query)) append(k, v);
		if (q.size) route += `?${q}`;
		const result = await this.read(
			await this.fetch(
				route,
				{
					method: op.method,
					...(input.body !== undefined
						? {
								headers: { "content-type": "application/json" },
								body: JSON.stringify(input.body),
							}
						: {}),
				},
				signal,
			),
		);
		if (
			this.allowed.length &&
			["session.list", "project.list"].includes(op.id)
		) {
			const items = Array.isArray(result) ? result : result?.data;
			if (!Array.isArray(items))
				throw new Error("Workspace scope cannot be verified");
			const filtered = [];
			for (const item of items) {
				const directory =
					op.id === "session.list"
						? item?.location?.directory
						: item?.canonical;
				if (await this.isAllowed(directory)) filtered.push(item);
			}
			return Array.isArray(result) ? filtered : { ...result, data: filtered };
		}
		return result;
	}
	private async isAllowed(directory: unknown): Promise<boolean> {
		if (typeof directory !== "string") return false;
		try {
			const resolved = await realpath(directory);
			return this.allowed.some(
				(root) => resolved === root || resolved.startsWith(root + path.sep),
			);
		} catch {
			return false;
		}
	}
	private async checkSession(id: string, signal?: AbortSignal) {
		if (!id || id === "." || id === ".." || /[\\/]/.test(id))
			throw new Error("Invalid session ID");
		const session = await this.read(
			await this.fetch(`/api/session/${encodeURIComponent(id)}`, {}, signal),
		);
		const directory =
			session?.data?.location?.directory ?? session?.location?.directory;
		if (typeof directory !== "string")
			throw new Error("Workspace scope cannot be verified");
		if (!(await this.isAllowed(directory)))
			throw new Error("Session is outside allowed workspace scope");
	}
	async events(
		input: {
			sessionID?: string;
			types?: string[];
			after?: number;
			limit?: number;
			durationMs?: number;
			source?: "live" | "log";
		},
		signal?: AbortSignal,
	): Promise<any> {
		if (this.allowed.length) {
			if (!input.sessionID)
				throw new Error("Scoped event access requires a session ID");
			await this.checkSession(input.sessionID, signal);
		}
		const useLog =
			input.source === "log" ||
			(input.source === undefined && input.after !== undefined);
		if (useLog && !input.sessionID)
			throw new Error("Session log requires a session ID");
		if (input.after !== undefined && !useLog)
			throw new Error("Global event stream does not support a cursor");
		const limit = Math.min(Math.max(input.limit || 50, 1), 200);
		const duration = Math.min(Math.max(input.durationMs || 5000, 100), 30000);
		let route = useLog
			? `/api/experimental/session/${encodeURIComponent(input.sessionID!)}/log`
			: "/api/event";
		const q = new URLSearchParams();
		if (input.after !== undefined) q.set("after", String(input.after));
		if (useLog) q.set("follow", "true");
		else if (input.types?.length)
			for (const type of input.types) q.append("types", type);
		if (q.size) route += `?${q}`;
		const ctl = new AbortController();
		const timer = setTimeout(() => ctl.abort(), duration);
		const combined = signal
			? AbortSignal.any([signal, ctl.signal])
			: ctl.signal;
		let response: Response;
		try {
			response = await this.fetch(
				route,
				{ headers: { accept: "text/event-stream" } },
				combined,
			);
		} catch (e) {
			clearTimeout(timer);
			throw e;
		}
		if (!response.ok) {
			clearTimeout(timer);
			throw new Error(`Event stream failed (HTTP ${response.status})`);
		}
		const reader = response.body?.getReader();
		if (!reader) {
			clearTimeout(timer);
			throw new Error("Event stream unavailable");
		}
		const decoder = new TextDecoder();
		let buffer = "",
			bytes = 0;
		const events: any[] = [];
		let cursor: unknown;
		try {
			while (events.length < limit) {
				const { done, value } = await reader.read();
				if (done) break;
				bytes += value.length;
				if (bytes > 2_000_000)
					throw new Error("Event stream exceeds size limit");
				buffer += decoder
					.decode(value, { stream: true })
					.replace(/\r\n/g, "\n");
				while (true) {
					const at = buffer.indexOf("\n\n");
					if (at < 0) break;
					const frame = buffer.slice(0, at);
					buffer = buffer.slice(at + 2);
					const fields = frame.split("\n");
					const event = fields
						.find((x) => x.startsWith("event:"))
						?.slice(6)
						.trim();
					const id = fields
						.find((x) => x.startsWith("id:"))
						?.slice(3)
						.trim();
					const data = fields
						.filter((x) => x.startsWith("data:"))
						.map((x) => x.slice(5).trimStart())
						.join("\n");
					if (!data) continue;
					let parsed: any;
					try {
						parsed = JSON.parse(data);
					} catch {
						continue;
					}
					if (event === "effect/http-api/stream/failure")
						throw new Error("Upstream event stream failed");
					const type = parsed.type || event;
					if (id) cursor = id;
					else if (typeof parsed.seq === "number") cursor = parsed.seq;
					const sid =
						parsed.sessionID ??
						parsed.properties?.sessionID ??
						parsed.payload?.sessionID ??
						parsed.data?.sessionID ??
						parsed.aggregateID;
					if (
						(useLog || !input.sessionID || sid === input.sessionID) &&
						(!input.types?.length || input.types.includes(type))
					)
						events.push(sanitize({ event, id, data: parsed }));
					if (events.length >= limit) break;
				}
			}
		} catch (e) {
			if (!ctl.signal.aborted || signal?.aborted) throw e;
		} finally {
			clearTimeout(timer);
			await reader.cancel().catch(() => {});
		}
		return {
			events,
			cursor: cursor ?? null,
			resumable: useLog,
			source: useLog ? "session-log" : "global-volatile",
		};
	}
}
