import { OpenCodeClient } from "./client";
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
  const result = await observeSession(client, {
    sessionID: options.sessionID,
    untilTurn: options.untilTurn,
    timeoutSeconds: options.timeoutSeconds,
  });
  return result.code;
}
