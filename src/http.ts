import { MAX_RESPONSE_BYTES } from "./limits.js";
import { sanitize } from "./security.js";

export class HttpTransport {
	constructor(
		private base: URL,
		private headers: HeadersInit,
		private timeout: number,
	) {}

	async fetch(
		pathname: string,
		init: RequestInit = {},
		signal?: AbortSignal,
	): Promise<Response> {
		// Reject absolute-looking routes before URL resolution can escape the
		// configured origin.
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

	async read(response: Response): Promise<any> {
		if (!response.ok)
			throw new Error(
				response.status === 404
					? "Resource or session not found"
					: response.status === 401 || response.status === 403
						? "Insufficient access"
						: `OpenCode request failed (HTTP ${response.status})`,
			);
		const len = Number(response.headers.get("content-length") || 0);
		if (len > MAX_RESPONSE_BYTES)
			throw new Error("Response exceeds size limit");
		const reader = response.body?.getReader();
		if (!reader) return null;
		let n = 0;
		const chunks: Uint8Array[] = [];
		while (true) {
			const r = await reader.read();
			if (r.done) break;
			n += r.value.length;
			if (n > MAX_RESPONSE_BYTES) {
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
}
