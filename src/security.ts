import type { Operation, OperationCategory } from "./types.js";

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

export const isBannedOperation = (id: string, path: string): boolean =>
	bannedRoute.test(id) || bannedRoute.test(path);

// Recurse through arrays and objects so nested credentials and inline URL
// credentials cannot leak through otherwise safe metadata.
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

export function classify(op: Operation): OperationCategory {
	if (op.method === "GET") return "read";
	if (exec.test(op.id)) return "exec";
	if (destructive.test(op.id) || op.method === "DELETE") return "destructive";
	if (safeWrites.has(op.id)) return "write";
	return "admin";
}

const gates: Partial<Record<OperationCategory, string>> = {
	admin: "OPENCODE_MCP_ALLOW_ADMIN",
	exec: "OPENCODE_MCP_ALLOW_EXEC",
	destructive: "OPENCODE_MCP_ALLOW_DESTRUCTIVE",
};

export function authorize(
	category: OperationCategory,
	env: NodeJS.ProcessEnv,
	confirm: boolean | undefined,
): void {
	const flag = gates[category];
	if (!flag) return;
	if (env[flag] !== "1" || confirm !== true)
		throw new Error(`Operation requires ${flag}=1 and confirm=true`);
}
