import type { HttpTransport } from "./http.js";
import { MAX_RESPONSE_BYTES } from "./limits.js";
import { sanitize } from "./security.js";
import type { WorkspaceScope } from "./scope.js";

export type EventRequest = {
	sessionID?: string;
	types?: string[];
	after?: number;
	limit?: number;
	durationMs?: number;
	source?: "live" | "log";
};

type Frame = { event?: string; id?: string; data: any };

function parseFrame(raw: string): Frame | null {
	const fields = raw.split("\n");
	const event = fields
		.find((field) => field.startsWith("event:"))
		?.slice(6)
		.trim();
	const id = fields
		.find((field) => field.startsWith("id:"))
		?.slice(3)
		.trim();
	const data = fields
		.filter((field) => field.startsWith("data:"))
		.map((field) => field.slice(5).trimStart())
		.join("\n");
	if (!data) return null;
	let parsed: any;
	try {
		parsed = JSON.parse(data);
	} catch {
		return null;
	}
	if (event === "effect/http-api/stream/failure")
		throw new Error("Upstream event stream failed");
	return { event, id, data: parsed };
}

function sessionID(data: any): unknown {
	return (
		data.sessionID ??
		data.properties?.sessionID ??
		data.payload?.sessionID ??
		data.data?.sessionID ??
		data.aggregateID
	);
}

export class EventStreams {
	constructor(
		private transport: HttpTransport,
		private scope: WorkspaceScope,
	) {}

	async read(input: EventRequest, signal?: AbortSignal): Promise<any> {
		if (this.scope.enabled) {
			if (!input.sessionID)
				throw new Error("Scoped event access requires a session ID");
			await this.scope.checkSession(input.sessionID, signal);
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
		const route = this.route(input, useLog);
		const ctl = new AbortController();
		const timer = setTimeout(() => ctl.abort(), duration);
		const combined = signal
			? AbortSignal.any([signal, ctl.signal])
			: ctl.signal;
		let response: Response;
		try {
			response = await this.transport.fetch(
				route,
				{ headers: { accept: "text/event-stream" } },
				combined,
			);
		} catch (error) {
			clearTimeout(timer);
			throw error;
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
		try {
			const collected = await this.collect(
				reader,
				input,
				useLog,
				limit,
				ctl,
				signal,
			);
			return {
				events: collected.events,
				cursor: collected.cursor ?? null,
				resumable: useLog,
				source: useLog ? "session-log" : "global-volatile",
			};
		} finally {
			clearTimeout(timer);
			await reader.cancel().catch(() => {});
		}
	}

	private route(input: EventRequest, useLog: boolean): string {
		let route = useLog
			? `/api/experimental/session/${encodeURIComponent(input.sessionID!)}/log`
			: "/api/event";
		const query = new URLSearchParams();
		if (input.after !== undefined) query.set("after", String(input.after));
		if (useLog) query.set("follow", "true");
		else if (input.types?.length)
			for (const type of input.types) query.append("types", type);
		if (query.size) route += `?${query}`;
		return route;
	}

	private async collect(
		reader: ReadableStreamDefaultReader<Uint8Array>,
		input: EventRequest,
		useLog: boolean,
		limit: number,
		ctl: AbortController,
		signal?: AbortSignal,
	): Promise<{ events: any[]; cursor: unknown }> {
		const decoder = new TextDecoder();
		let buffer = "";
		let bytes = 0;
		const events: any[] = [];
		let cursor: unknown;
		try {
			while (events.length < limit) {
				const { done, value } = await reader.read();
				if (done) break;
				bytes += value.length;
				if (bytes > MAX_RESPONSE_BYTES)
					throw new Error("Event stream exceeds size limit");
				buffer += decoder
					.decode(value, { stream: true })
					.replace(/\r\n/g, "\n");
				while (true) {
					const at = buffer.indexOf("\n\n");
					if (at < 0) break;
					const frame = buffer.slice(0, at);
					buffer = buffer.slice(at + 2);
					const parsed = parseFrame(frame);
					if (!parsed) continue;
					const type = parsed.data.type || parsed.event;
					if (parsed.id) cursor = parsed.id;
					else if (typeof parsed.data.seq === "number")
						cursor = parsed.data.seq;
					const sid = sessionID(parsed.data);
					if (
						(useLog || !input.sessionID || sid === input.sessionID) &&
						(!input.types?.length || input.types.includes(type))
					)
						events.push(
							sanitize({
								event: parsed.event,
								id: parsed.id,
								data: parsed.data,
							}),
						);
					if (events.length >= limit) break;
				}
			}
		} catch (error) {
			// A duration timeout ends a bounded read successfully; caller
			// cancellation still propagates.
			if (!ctl.signal.aborted || signal?.aborted) throw error;
		}
		return { events, cursor };
	}
}
