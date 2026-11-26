import { expect, test } from "bun:test";
import { createNativeLauncher } from "../src/service-launch";

test("native launcher uses argv, bounds time, and cleans up the child", async () => {
  const launcher = createNativeLauncher({ killGraceMs: 100 });
  const started = Date.now();
  const result = await launcher({
    command: process.execPath,
    args: ["-e", "setTimeout(() => {}, 10000)"],
    timeoutMs: 150,
    env: {},
  });
  expect(result.timedOut).toBe(true);
  expect(result.code).toBeNull();
  expect(result.pid).toBeNumber();
  expect(Date.now() - started).toBeLessThan(3000);
});

test("native launcher escalates an uncooperative child", async () => {
  const launcher = createNativeLauncher({ killGraceMs: 100 });
  const result = await launcher({
    command: process.execPath,
    args: [
      "-e",
      "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)",
    ],
    timeoutMs: 150,
    env: {},
  });
  expect(result.timedOut).toBe(true);
  expect(result.pid).toBeNumber();
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(() => process.kill(result.pid as number, 0)).toThrow();
}, 15000);
