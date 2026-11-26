import { expect, test } from "bun:test";
import {
  JOURNALED_OPERATIONS,
  operationCapturesPrompt,
  runJournaledOperation,
} from "../src/journal";
import type { JournalAdapter, JournalRecord } from "../src/journal";

function memoryAdapter() {
  const records: JournalRecord[] = [];
  let closed = false;
  const adapter: JournalAdapter = {
    apiVersion: 1,
    async record(record) {
      if (closed) throw new Error("closed");
      const exists = records.some((item) => item.id === record.id);
      if (!exists) records.push(record);
      return { id: record.id, inserted: !exists };
    },
    async query() {
      return { records: [...records], next: null };
    },
    async stats() {
      return {
        total: records.length,
        firstAt: null,
        lastAt: null,
        byOutcome: [],
        byOperation: [],
      };
    },
    async close() {
      closed = true;
    },
  };
  return { adapter, records, closed: () => closed };
}

test("captures outcome, duration, native IDs and authorized prompt", async () => {
  const memory = memoryAdapter();
  let times = [Date.UTC(2026, 0, 1), Date.UTC(2026, 0, 1) + 275];
  const result = await runJournaledOperation({
    operation: "opencode.session.send",
    prompt: "synthetic authorized prompt",
    sessionId: "fallback-session",
    run: async () => ({ messageId: "m-1", title: "Native title" }),
    metadata: (value) => ({
      sessionId: "native-session",
      sessionTitle: value.title,
      messageId: value.messageId,
    }),
    adapter: memory.adapter,
    id: "stable-id",
    now: () => times.shift()!,
  });
  expect(result).toEqual({ messageId: "m-1", title: "Native title" });
  expect(memory.records[0]).toEqual({
    id: "stable-id",
    at: "2026-01-01T00:00:00.000Z",
    operation: "opencode.session.send",
    outcome: "success",
    durationMs: 275,
    sessionId: "native-session",
    sessionTitle: "Native title",
    messageId: "m-1",
    prompt: "synthetic authorized prompt",
  });
});

test("non-prompt operations never persist prompt text", async () => {
  const memory = memoryAdapter();
  await runJournaledOperation({
    operation: "opencode.session.status",
    prompt: "must not be stored",
    sessionId: "s-1",
    run: async () => "ok",
    adapter: memory.adapter,
  });
  expect(memory.records[0].prompt).toBeUndefined();
  expect(memory.records[0].sessionId).toBe("s-1");
  expect(memory.records[0].outcome).toBe("success");
});

test("a native failure is rethrown after recording failure outcome", async () => {
  const memory = memoryAdapter();
  const native = new Error("native action failed");
  let caught: unknown;
  try {
    await runJournaledOperation({
      operation: "opencode.session.run",
      run: async () => {
        throw native;
      },
      adapter: memory.adapter,
    });
  } catch (error) {
    caught = error;
  }
  expect(caught).toBe(native);
  expect(memory.records[0].outcome).toBe("failure");
  expect(memory.records[0].operation).toBe("opencode.session.run");
});

test("journal failures never change a successful action result", async () => {
  const memory = memoryAdapter();
  await memory.adapter.close();
  const result = await runJournaledOperation({
    operation: "opencode.session.start",
    run: async () => ({ id: "started" }),
    adapter: memory.adapter,
  });
  expect(result).toEqual({ id: "started" });
  expect(memory.records).toHaveLength(0);
});

test("an asynchronous adapter cannot delay receipt past the bound", async () => {
  const hanging: JournalAdapter = {
    apiVersion: 1,
    record: () => new Promise(() => {}),
    query: async () => ({ records: [], next: null }),
    stats: async () => ({
      total: 0,
      firstAt: null,
      lastAt: null,
      byOutcome: [],
      byOperation: [],
    }),
    close: async () => {},
  };
  const started = Date.now();
  const result = await runJournaledOperation({
    operation: "opencode.session.monitor",
    run: async () => "receipt",
    adapter: hanging,
    recordTimeoutMs: 20,
  });
  expect(result).toBe("receipt");
  expect(Date.now() - started).toBeLessThan(1_000);
});

test("disabled journaling is a no-op", async () => {
  const result = await runJournaledOperation({
    operation: "opencode.service.start",
    run: async () => "healthy",
    adapter: null,
  });
  expect(result).toBe("healthy");
});

test("integration operation plan captures prompts only for start/send/run", () => {
  expect(JOURNALED_OPERATIONS).toContain("opencode.service.start");
  expect(operationCapturesPrompt("opencode.session.start")).toBe(true);
  expect(operationCapturesPrompt("opencode.session.send")).toBe(true);
  expect(operationCapturesPrompt("opencode.session.run")).toBe(true);
  expect(operationCapturesPrompt("opencode.session.monitor")).toBe(false);
  expect(operationCapturesPrompt("opencode.session.status")).toBe(false);
  expect(operationCapturesPrompt("opencode.session.messages")).toBe(false);
  expect(operationCapturesPrompt("opencode.session.sessions")).toBe(false);
  expect(operationCapturesPrompt("opencode.service.start")).toBe(false);
});
