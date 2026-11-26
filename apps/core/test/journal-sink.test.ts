import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  classifyToolResult,
  journalInvocation,
} from "../src/journal/invocation";
import { JournalSink } from "../src/journal/sink";
import type {
  JournalAdapter,
  JournalFilter,
  JournalPage,
  JournalQuery,
  JournalRecord,
  JournalStats,
} from "../src/journal/types";
import { makeSandbox } from "./support";

function memoryAdapter() {
  const records: JournalRecord[] = [];
  const adapter: JournalAdapter = {
    apiVersion: 1,
    async record(record) {
      const exists = records.some((entry) => entry.id === record.id);
      if (!exists) records.push(record);
      return { id: record.id, inserted: !exists };
    },
    async query(_value?: JournalQuery): Promise<JournalPage> {
      return { records: [...records], next: null };
    },
    async stats(_value?: JournalFilter): Promise<JournalStats> {
      return {
        total: records.length,
        firstAt: null,
        lastAt: null,
        byOutcome: [],
        byOperation: [],
      };
    },
    async close() {},
  };
  return { adapter, records };
}

test("a late native resolution after abort is classified cancelled", async () => {
  const memory = memoryAdapter();
  const sink = new JournalSink({ adapter: memory.adapter });
  const controller = new AbortController();
  const value = await journalInvocation(
    {
      sink,
      operation: "kaiten.mcp.kaiten_health",
      signal: controller.signal,
    },
    async () => {
      controller.abort();
      return { isError: false };
    },
  );
  expect(value).toEqual({ isError: false });
  expect(memory.records).toHaveLength(1);
  expect(memory.records[0]?.outcome).toBe("cancelled");
});

test("the MCP result classifier records an isError call once as failure", async () => {
  const memory = memoryAdapter();
  const sink = new JournalSink({ adapter: memory.adapter });
  const result = await journalInvocation(
    {
      sink,
      operation: "opencode.mcp.opencode_server_info",
      outcome: classifyToolResult,
    },
    async () => ({ isError: true, content: [{ type: "text", text: "no" }] }),
  );
  expect(result).toMatchObject({ isError: true });
  expect(memory.records).toHaveLength(1);
  expect(memory.records[0]?.outcome).toBe("failure");
});

test("close during a pending adapter open never hangs and closes the late adapter", async () => {
  const sandbox = await makeSandbox();
  const marker = path.join(sandbox.root, "closed.marker");
  const gate = path.join(sandbox.root, "open.gate");
  const moduleFile = path.join(sandbox.root, "slow-adapter.mjs");
  // Explicit options are the only reliable channel for a dynamically imported
  // adapter: the child does not inherit the test's scoped sink env.
  await writeFile(
    moduleFile,
    `import { existsSync, writeFileSync } from "node:fs";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export default {
  apiVersion: 1,
  async create(options) {
    while (!existsSync(options.gate)) await wait(5);
    return {
      apiVersion: 1,
      async record(record) { return { id: record.id, inserted: true }; },
      async query() { return { records: [], next: null }; },
      async stats() { return { total: 0, firstAt: null, lastAt: null, byOutcome: [], byOperation: [] }; },
      async close() { writeFileSync(options.closeMarker, "closed"); }
    };
  }
};
`,
  );
  await sandbox.write("config.json", {
    journal: {
      enabled: true,
      adapter: {
        module: moduleFile,
        options: { gate, closeMarker: marker },
      },
    },
  });
  const sink = new JournalSink({
    env: { NONES_CONFIG_DIR: sandbox.configDir },
  });
  const recording = sink.record({
    id: "late",
    at: "2026-01-01T00:00:00.000Z",
    operation: "kaiten.mcp.kaiten_health",
    outcome: "success",
    durationMs: 1,
  });
  const started = Date.now();
  await sink.close();
  expect(Date.now() - started).toBeLessThan(250);
  // Release the gated open only after close, proving the late adapter is closed.
  await writeFile(gate, "open");
  await recording;
  for (let attempt = 0; attempt < 200 && !existsSync(marker); attempt++)
    await new Promise((resolve) => setTimeout(resolve, 10));
  expect(existsSync(marker)).toBe(true);
});
