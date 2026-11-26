import { expect, test } from "bun:test";
import { groupHistory } from "../src/history.js";

test("groups steering and terminal separately", () => {
	const result = groupHistory({
		data: [
			{ id: "u1", type: "user" },
			{
				id: "a",
				type: "assistant",
				parts: [{ type: "tool", output: "ok" }],
			},
			{ id: "u2", type: "user" },
			{ id: "a2", type: "assistant" },
			{ type: "idle" },
		],
		cursor: { next: null },
	});
	expect(result.groups).toHaveLength(2);
	expect(result.groups[0].steps[0].parts[0].output).toBe("ok");
	expect(result.groups[1].terminal.type).toBe("idle");
});
