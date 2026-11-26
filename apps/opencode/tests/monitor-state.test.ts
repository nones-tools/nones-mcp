import { expect, test } from "bun:test";
import { TurnState } from "../src/monitor-state";

test("waits for an outcome that arrives after the idle timestamp", () => {
  const written: any[] = [];
  const state = new TurnState({
    sessionID: "ses_test",
    untilTurn: true,
    write: (line) => written.push(line),
  });
  state.init({ id: "ses_test", time: { created: 1, busy: 2 } });
  expect(
    state.reconcile({
      id: "ses_test",
      time: { created: 1, busy: 2, idle: 10 },
    }),
  ).toBeUndefined();
  expect(written.some((line) => line.event === "success")).toBe(false);

  const result = state.reconcile({
    id: "ses_test",
    outcome: "succeeded",
    time: { created: 1, busy: 2, idle: 10 },
  });
  expect(result).toMatchObject({ code: 0, reason: "success" });
  expect(written.filter((line) => line.event === "success")).toHaveLength(1);
});

test("follow mode keeps following after a failed turn", () => {
  const written: any[] = [];
  const state = new TurnState({
    sessionID: "ses_test",
    write: (line) => written.push(line),
  });
  state.init({ id: "ses_test", time: { created: 1, busy: 2 } });
  expect(
    state.reconcile({
      id: "ses_test",
      outcome: "failed",
      time: { created: 1, busy: 2, idle: 10 },
    }),
  ).toBeUndefined();

  state.init({ id: "ses_test", time: { created: 1, busy: 20 } });
  expect(
    state.reconcile({
      id: "ses_test",
      outcome: "succeeded",
      time: { created: 1, busy: 20, idle: 30 },
    }),
  ).toBeUndefined();
  expect(written.filter((line) => line.event === "failure")).toHaveLength(1);
  expect(written.filter((line) => line.event === "success")).toHaveLength(1);
});
