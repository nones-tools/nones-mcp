import type { NormalizedEvent } from "./monitor-events";
import type { SessionInfo } from "./native-session";

export interface MonitorResult {
  code: number;
  reason: "success" | "failure" | "timeout" | "signal";
  outcome?: string;
}

export interface MonitorLine {
  [key: string]: unknown;
}

interface TurnOptions {
  sessionID: string;
  untilTurn?: boolean;
  write: (line: MonitorLine) => void;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function isBusy(info: SessionInfo): boolean {
  const busy = number(info.time?.busy);
  const idle = number(info.time?.idle);
  return busy !== undefined && (idle === undefined || busy > idle);
}

/** Turn state derived from native timestamps plus observed execution events. */
export class TurnState {
  private lastBusy?: number;
  private lastIdle?: number;
  private open = false;
  private startAt?: number;
  private terminal = false;
  private pendingIdle?: number;
  private terminals = new Set<string>();

  constructor(private options: TurnOptions) {}

  get busy(): boolean {
    return this.open;
  }

  init(info: SessionInfo): void {
    this.lastBusy = number(info.time?.busy);
    this.lastIdle = number(info.time?.idle);
    this.open = isBusy(info);
    this.startAt = this.open ? this.lastBusy : undefined;
    this.terminal = false;
    this.pendingIdle = undefined;
    this.terminals.clear();
  }

  apply(event: NormalizedEvent, key?: string): MonitorResult | undefined {
    if (event.event === "turn-start") {
      this.open = true;
      this.startAt = event.at ?? Date.now();
      this.terminal = false;
      this.pendingIdle = undefined;
      this.terminals.clear();
      this.options.write(event as unknown as MonitorLine);
      return;
    }
    if (event.event === "success" || event.event === "failure")
      return this.finish(event, key);
    this.options.write(event as unknown as MonitorLine);
  }

  reconcile(info: SessionInfo): MonitorResult | undefined {
    const busy = number(info.time?.busy);
    const idle = number(info.time?.idle);
    if (
      busy !== undefined &&
      (this.lastBusy === undefined || busy > this.lastBusy)
    ) {
      this.lastBusy = busy;
      const same =
        this.open &&
        this.startAt !== undefined &&
        Math.abs(busy - this.startAt) < 1500;
      if (!same) {
        this.open = true;
        this.startAt = busy;
        this.terminal = false;
        this.pendingIdle = undefined;
        this.terminals.clear();
        this.options.write({
          event: "turn-start",
          sessionID: this.options.sessionID,
          at: busy,
          source: "snapshot",
        });
      }
    }
    if (
      this.pendingIdle !== undefined &&
      !this.terminal &&
      (busy === undefined || this.pendingIdle >= busy)
    ) {
      const pending = this.resolve(info, this.pendingIdle);
      if (pending) return pending;
    }
    if (
      idle === undefined ||
      (this.lastIdle !== undefined && idle <= this.lastIdle)
    )
      return;
    this.lastIdle = idle;
    if (this.terminal) return;
    if (busy !== undefined && idle < busy) return;
    this.pendingIdle = idle;
    return this.resolve(info, idle);
  }

  /** Outcome can lag behind the idle timestamp; keep the pending idle. */
  private resolve(info: SessionInfo, at: number): MonitorResult | undefined {
    const event =
      info.outcome === "succeeded"
        ? ({
            event: "success",
            sessionID: info.id,
            at,
            reason: "succeeded",
          } as const)
        : info.outcome === "failed" || info.outcome === "interrupted"
          ? ({
              event: "failure",
              sessionID: info.id,
              at,
              reason: info.outcome,
            } as const)
          : null;
    return event ? this.finish(event) : undefined;
  }

  private finish(
    event: NormalizedEvent,
    key?: string,
  ): MonitorResult | undefined {
    if (this.terminal || (key && this.terminals.has(key))) return;
    if (key) this.terminals.add(key);
    this.terminal = true;
    this.open = false;
    this.pendingIdle = undefined;
    if (event.at !== null)
      this.lastIdle = Math.max(this.lastIdle ?? 0, event.at);
    this.options.write(event as unknown as MonitorLine);
    if (event.event === "success")
      return this.options.untilTurn
        ? { code: 0, reason: "success", outcome: "succeeded" }
        : undefined;
    return this.options.untilTurn
      ? { code: 2, reason: "failure", outcome: event.reason ?? "failed" }
      : undefined;
  }
}
