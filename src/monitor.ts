import type { OpenCodeClient } from "./client";
import {
  isNoisyNative,
  nativeLine,
  normalizeNative,
  terminalKey,
} from "./monitor-events";
import {
  TurnState,
  type MonitorLine,
  type MonitorResult,
} from "./monitor-state";
import { getSession, type SessionInfo } from "./native-session";

export type { MonitorResult } from "./monitor-state";

export interface MonitorOptions {
  sessionID: string;
  untilTurn?: boolean;
  timeoutSeconds?: number;
  deadline?: number;
  baseline?: SessionInfo;
  writer?: (line: string) => void;
  signal?: AbortSignal;
  readMs?: number;
  retries?: number;
}

const MIN_CYCLE_MS = 250;

/**
 * Observe one native session with short bounded live SSE reads plus
 * session.get reconciliation. The live stream has no replay, so terminal
 * state comes from native time and outcome rather than an admission receipt.
 */
export class SessionMonitor {
  private writer: (line: string) => void;
  private state: TurnState;
  private deadline?: number;
  private streamFailures = 0;
  private snapshotFailures = 0;

  constructor(
    private client: OpenCodeClient,
    private options: MonitorOptions,
  ) {
    this.writer = options.writer ?? ((line) => process.stdout.write(line));
    this.state = new TurnState({
      sessionID: options.sessionID,
      untilTurn: options.untilTurn,
      write: (line) => this.write(line),
    });
    this.deadline =
      options.deadline ??
      (options.timeoutSeconds
        ? Date.now() + options.timeoutSeconds * 1000
        : undefined);
  }

  async run(): Promise<MonitorResult> {
    let info: SessionInfo;
    try {
      info = this.options.baseline ?? (await this.snapshot(this.cycleSignal()));
    } catch (error) {
      const stopped = this.stopCheck();
      if (stopped) return stopped;
      throw error;
    }
    this.state.init(info);
    this.write({
      event: "status",
      sessionID: this.options.sessionID,
      busy: this.state.busy,
      outcome: info.outcome ?? null,
      time: info.time ?? null,
      title: info.title ?? null,
      model: info.model ?? null,
      directory: info.location?.directory ?? null,
    });
    while (true) {
      const stopped = this.stopCheck();
      if (stopped) return stopped;
      const cycleStart = Date.now();
      const cycle = this.cycleSignal();
      const remaining = this.deadline ? this.deadline - Date.now() : 1000;
      const readMs = Math.max(
        100,
        Math.min(this.options.readMs ?? 1000, remaining),
      );
      try {
        const page = await this.client.events(
          { sessionID: this.options.sessionID, durationMs: readMs, limit: 200 },
          cycle,
        );
        this.streamFailures = 0;
        for (const event of Array.isArray(page?.events) ? page.events : []) {
          const native = event?.data;
          if (!native?.type) continue;
          if (!isNoisyNative(native.type))
            this.write(nativeLine(native, this.options.sessionID));
          const normalized = normalizeNative(native, this.options.sessionID);
          const result = normalized
            ? this.state.apply(normalized, terminalKey(native))
            : undefined;
          if (result) return result;
        }
      } catch (error) {
        const stop = this.stopCheck();
        if (stop) return stop;
        if (++this.streamFailures >= (this.options.retries ?? 3)) throw error;
      }
      let snapshot: SessionInfo;
      try {
        snapshot = await this.snapshot(this.cycleSignal());
        this.snapshotFailures = 0;
      } catch (error) {
        const stop = this.stopCheck();
        if (stop) return stop;
        if (++this.snapshotFailures >= (this.options.retries ?? 3)) throw error;
        await this.rest(MIN_CYCLE_MS);
        continue;
      }
      const reconciled = this.state.reconcile(snapshot);
      if (reconciled) return reconciled;
      const elapsed = Date.now() - cycleStart;
      if (elapsed < MIN_CYCLE_MS) await this.rest(MIN_CYCLE_MS - elapsed);
    }
  }

  /** Bound attach and cycle work by both caller cancellation and deadline. */
  private cycleSignal(): AbortSignal | undefined {
    const signals: AbortSignal[] = [];
    if (this.options.signal) signals.push(this.options.signal);
    if (this.deadline !== undefined)
      signals.push(
        AbortSignal.timeout(Math.max(1, this.deadline - Date.now())),
      );
    if (signals.length === 1) return signals[0];
    return signals.length ? AbortSignal.any(signals) : undefined;
  }

  private snapshot(signal?: AbortSignal): Promise<SessionInfo> {
    return getSession(this.client, this.options.sessionID, signal);
  }

  private rest(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const signal = this.options.signal;
      const timer = setTimeout(done, Math.max(1, ms));
      function done() {
        clearTimeout(timer);
        signal?.removeEventListener("abort", done);
        resolve();
      }
      signal?.addEventListener("abort", done, { once: true });
    });
  }

  private stopCheck(): MonitorResult | undefined {
    if (this.options.signal?.aborted) return this.signal();
    if (this.deadline !== undefined && Date.now() >= this.deadline) {
      this.write({
        event: "timeout",
        sessionID: this.options.sessionID,
        at: Date.now(),
      });
      return { code: 124, reason: "timeout" };
    }
  }

  private signal(): MonitorResult {
    this.write({
      event: "stopped",
      sessionID: this.options.sessionID,
      reason: "signal",
    });
    return { code: 130, reason: "signal" };
  }

  private write(value: MonitorLine): void {
    this.writer(`${JSON.stringify(value)}\n`);
  }
}

export function monitorSession(
  client: OpenCodeClient,
  options: MonitorOptions,
): Promise<MonitorResult> {
  return new SessionMonitor(client, options).run();
}
