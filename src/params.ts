import type { Operation, Request } from "./types.js";
import { isUnsafePathSegment } from "./validation.js";

function appendQuery(
	query: URLSearchParams,
	key: string,
	value: unknown,
): void {
	if (Array.isArray(value)) {
		for (const item of value) appendQuery(query, key, item);
	} else if (value !== null && typeof value === "object") {
		for (const [child, item] of Object.entries(value))
			appendQuery(query, `${key}[${child}]`, item);
	} else if (["string", "number", "boolean"].includes(typeof value))
		query.append(key, String(value));
	else throw new Error("Invalid query parameter");
}

/**
 * Validate only catalog-declared parameters, then encode each path segment
 * independently and serialize nested query values with bracket notation.
 */
export function buildRoute(
	op: Operation,
	params: Request["path"],
	query: Request["query"],
): string {
	const knownPath = op.parameters
		.filter((p) => p.in === "path")
		.map((p) => p.name);
	const knownQuery = op.parameters
		.filter((p) => p.in === "query")
		.map((p) => p.name);
	const path = params || {};
	const values = query || {};
	if (
		Object.keys(path).some((k) => !knownPath.includes(k)) ||
		Object.keys(values).some((k) => !knownQuery.includes(k))
	)
		throw new Error("Unknown parameter");
	let route = op.path.replace(/\{([^}]+)\}/g, (_, key: string) => {
		const value = path[key];
		if (isUnsafePathSegment(value)) throw new Error("Invalid path parameter");
		return encodeURIComponent(value);
	});
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(values))
		appendQuery(search, key, value);
	if (search.size) route += `?${search}`;
	return route;
}
