import { OpenCodeClient } from "./client";
import { recordJournaledOperation } from "./journal/cli-action";
import { monitorOutcome } from "./journal-cli";
import {
  monitorSession,
  type MonitorOptions,
  type MonitorResult,
} from "./monitor";

export interface MonitorCommandOptions {
  sessionID: string;
  untilTurn?: boolean;
  timeoutSeconds?: number;
}

/**
 * Observe without ever interrupting the native session. Ctrl+C aborts local
 * observation only, so the running turn keeps going on the service.
 */
export async function observeSession(
  client: OpenCodeClient,
  options: MonitorOptions,
): Promise<MonitorResult> {
  const controller = new AbortController();
  const onSignal = () => controller.abort();
  process.once("SIGINT", onSignal);
  try {
    return await monitorSession(client, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    process.removeListener("SIGINT", onSignal);
  }
}

export async function runMonitorCommand(
  options: MonitorCommandOptions,
  env: { [name: string]: string | undefined } = process.env,
): Promise<number> {
  const client = await OpenCodeClient.connect(env);
  const startedAt = Date.now();
  try {
    const result = await observeSession(client, {
      sessionID: options.sessionID,
      untilTurn: options.untilTurn,
      timeoutSeconds: options.timeoutSeconds,
    });
    await recordJournaledOperation({
      operation: "opencode.session.monitor",
      sessionId: options.sessionID,
      outcome: monitorOutcome(result.code),
      startedAt,
      endedAt: Date.now(),
      env,
    });
    return result.code;
  } catch (error) {
    await recordJournaledOperation({
      operation: "opencode.session.monitor",
      sessionId: options.sessionID,
      outcome: "failure",
      startedAt,
      endedAt: Date.now(),
      env,
    });
    throw error;
  }
}
