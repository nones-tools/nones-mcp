import { expect, test } from "bun:test";
import { createActionRegistry } from "../src/registry/registry";
import type { ActionDefinition } from "../src/registry/types";

function action(
  id: string,
  tool: string,
  cli: string,
  aliases: string[] = [],
): ActionDefinition {
  return {
    id,
    cli: { command: cli, aliases },
    tool: { name: tool, inputSchema: { type: "object", properties: {} } },
    handle: async () => ({ ok: true }),
  };
}

test("a failed add leaves no ghost command, tool or action", () => {
  const registry = createActionRegistry("test", [action("a", "tool_a", "alpha")]);
  expect(() =>
    registry.add(action("b", "tool_a", "beta", ["beta-alias"])),
  ).toThrow(/duplicate MCP tool/);
  expect(registry.command("beta")).toBeUndefined();
  expect(registry.command("beta-alias")).toBeUndefined();
  expect(registry.tool("tool_a")?.id).toBe("a");
  expect(registry.actions.map((entry) => entry.id)).toEqual(["a"]);
});

test("an action repeating its own alias is rejected atomically", () => {
  const registry = createActionRegistry("test");
  expect(() =>
    registry.add(action("a", "tool_a", "alpha", ["alpha"])),
  ).toThrow(/repeats its own/);
  expect(registry.command("alpha")).toBeUndefined();
  expect(registry.tool("tool_a")).toBeUndefined();
  expect(registry.actions).toHaveLength(0);
});

test("a duplicate id is rejected before command or tool insertion", () => {
  const registry = createActionRegistry("test", [action("a", "tool_a", "alpha")]);
  expect(() =>
    registry.add(action("a", "tool_b", "beta")),
  ).toThrow(/duplicate action id/);
  expect(registry.command("beta")).toBeUndefined();
  expect(registry.tool("tool_b")).toBeUndefined();
  expect(registry.actions).toHaveLength(1);
});
