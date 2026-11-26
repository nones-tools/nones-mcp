import { describe, expect, test } from "bun:test";
import { indexTool, validateModuleDefinition, type HostedTool } from "../src/modules";
import type { ModuleTool } from "../src/types";

function fakeTool(name: string): ModuleTool {
  return {
    definition: { name, inputSchema: { type: "object", properties: {} } },
    call: async () => ({ content: [{ type: "text", text: "ok" }] }),
  };
}

describe("module interface validation", () => {
  test("rejects wrong API version and mismatched id", () => {
    const base = { apiVersion: 1 as const, id: "kaiten", version: "0.1.0", start: async () => ({ tools: [], close: async () => {} }) };
    expect(() => validateModuleDefinition({ ...base, apiVersion: 2 }, "kaiten")).toThrow(
      /targets API 2; core requires 1/,
    );
    expect(() => validateModuleDefinition({ ...base, id: "opencode" }, "kaiten")).toThrow(
      /declares id opencode/,
    );
    expect(() => validateModuleDefinition({}, "kaiten")).toThrow(/no exported module definition/);
  });
});

describe("tool indexing", () => {
  test("fails on duplicate names across modules", () => {
    const tools = new Map<string, HostedTool>();
    indexTool(tools, "kaiten", fakeTool("shared_tool"), 0);
    expect(() => indexTool(tools, "opencode", fakeTool("shared_tool"), 0)).toThrow(
      /shared_tool is provided by both kaiten and opencode/,
    );
    expect(tools.size).toBe(1);
  });

  test("fails on duplicate names inside one module", () => {
    const tools = new Map<string, HostedTool>();
    indexTool(tools, "kaiten", fakeTool("dup"), 0);
    expect(() => indexTool(tools, "kaiten", fakeTool("dup"), 1)).toThrow(/both kaiten and kaiten/);
  });

  test("rejects unsafe names and missing schemas", () => {
    const tools = new Map<string, HostedTool>();
    expect(() => indexTool(tools, "kaiten", fakeTool("bad name"), 0)).toThrow(/invalid tool name/);
    const noSchema = { ...fakeTool("x"), definition: { name: "x" } } as unknown as ModuleTool;
    expect(() => indexTool(tools, "kaiten", noSchema, 0)).toThrow(/no JSON Schema inputSchema/);
  });
});
