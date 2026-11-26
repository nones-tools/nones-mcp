import { formatJson } from "./json.js";

/**
 * Text is pretty for humans; structuredContent keeps the exact data shape so
 * clients do not need to parse formatted text.
 */
export function toolResult(data: unknown) {
	return {
		content: [{ type: "text" as const, text: formatJson(data) }],
		structuredContent: { data },
	};
}

export function toolFailure(error: unknown) {
	return {
		content: [
			{
				type: "text" as const,
				text: error instanceof Error ? error.message : "Operation failed",
			},
		],
		isError: true,
	};
}
