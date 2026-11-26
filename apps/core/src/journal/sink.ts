import type { Logger } from "../types";
import { resolveJournalConfig, type JournalSettings } from "./config";
import { isJournalError } from "./errors";
import {
  DEFAULT_RECORD_TIMEOUT_MS,
  MAX_RECORD_TIMEOUT_MS,
} from "./limits";
import { createJournalAdapter } from "./loader";
import { PromptPolicyAdapter } from "./policy";
import type { JournalAdapter, JournalRecord } from "./types";

export interface SafeRecordResult {
  recorded: boolean;
  inserted: boolean;
  error: string | null;
}

export interface JournalDiagnostics {
  /** null until settings were resolved. */
  enabled: boolean | null;
  /** Selected adapter, for support reports. */
  adapter: string | null;
  lastError: string | null;
}

export interface JournalSinkOptions {
  /** Already-resolved settings; avoids re-reading config in the aggregate. */
  settings?: JournalSettings;
  /** Trusted injected adapter. A null adapter explicitly disables journaling. */
  adapter?: JournalAdapter | null;
  env?: Record<string, string | undefined>;
  cwd?: string;
  logger?: Logger;
  /** Upper bound for opening, recording and closing. */
  recordTimeoutMs?: number;
}

/**
 * Private opt-out for an app-owned lifecycle probe child. Only the probe process
 * sets it; normal CLI and MCP starts never see this value.
 */
export const JOURNAL_SUPPRESS_ENV = "NONES_MCP_JOURNAL_SUPPRESS";

export function journalSuppressed(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env[JOURNAL_SUPPRESS_ENV] === "1";
}

/**
 * Builds the process journal sink. A private probe child gets a disabled sink so
 * its synthetic readiness calls never appear as user operations.
 */
export function journalSinkFor(options: JournalSinkOptions = {}): JournalSink {
  if (options.adapter === undefined && journalSuppressed(options.env ?? process.env))
    return JournalSink.disabled();
  return new JournalSink(options);
}

function timeoutFor(value: number | undefined): number {
  if (value === undefined) return DEFAULT_RECORD_TIMEOUT_MS;
  if (!Number.isInteger(value) || value < 1) return DEFAULT_RECORD_TIMEOUT_MS;
  return Math.min(value, MAX_RECORD_TIMEOUT_MS);
}

function safeError(error: unknown): string {
  if (isJournalError(error)) return error.message;
  return "journal adapter error";
}

function bounded<T>(task: Promise<T>, ms: number): Promise<T | "timeout"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), ms);
    (timer as { unref?: () => void }).unref?.();
  });
  return Promise.race([task, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Central journal lifecycle: one lazy adapter open per process, bounded
 * best-effort writes, safe diagnostics and idempotent close. Config or adapter
 * failures never throw into the native operation and never trigger a retry that
 * could duplicate a record.
 */
export class JournalSink {
  #settings: JournalSettings | undefined;
  readonly #injected: JournalAdapter | null | undefined;
  readonly #env: Record<string, string | undefined>;
  readonly #cwd: string;
  readonly #logger: Logger | undefined;
  readonly #timeout: number;
  #adapter: JournalAdapter | null | undefined;
  #owned = false;
  #closed = false;
  #opening: Promise<JournalAdapter | null> | undefined;
  #openFailed = false;
  #diagnostics: JournalDiagnostics;

  constructor(options: JournalSinkOptions = {}) {
    this.#settings = options.settings;
    this.#injected = options.adapter;
    this.#env = options.env ?? process.env;
    this.#cwd = options.cwd ?? process.cwd();
    this.#logger = options.logger;
    this.#timeout = timeoutFor(options.recordTimeoutMs);
    this.#diagnostics = {
      enabled:
        options.adapter !== undefined
          ? options.adapter !== null
          : (options.settings?.enabled ?? null),
      adapter: options.adapter ? "injected" : (options.settings?.adapter?.module ?? null),
      lastError: null,
    };
  }

  /** A sink that never reads config and never records. */
  static disabled(): JournalSink {
    return new JournalSink({ adapter: null });
  }

  diagnostics(): JournalDiagnostics {
    return { ...this.#diagnostics };
  }

  #fail(error: unknown, action: string): void {
    const message = safeError(error);
    this.#diagnostics.lastError = message;
    this.#logger?.warn(`journal ${action} failed`, { error: message });
  }

  async #open(): Promise<JournalAdapter | null> {
    let settings = this.#settings;
    if (!settings) {
      try {
        settings = await resolveJournalConfig(this.#env, this.#cwd);
      } catch (error) {
        this.#openFailed = true;
        this.#fail(error, "config");
        return null;
      }
      this.#settings = settings;
    }
    this.#diagnostics.enabled = settings.enabled;
    this.#diagnostics.adapter = settings.adapter?.module ?? "sqlite";
    if (!settings.enabled) return null;
    try {
      const inner = await createJournalAdapter(settings);
      this.#owned = true;
      return new PromptPolicyAdapter(inner, settings.capturePrompts);
    } catch (error) {
      this.#openFailed = true;
      this.#fail(error, "open");
      return null;
    }
  }

  async #ensure(): Promise<JournalAdapter | null> {
    if (this.#closed) return null;
    if (this.#adapter !== undefined) return this.#adapter;
    if (this.#injected !== undefined) {
      this.#adapter = this.#injected;
      this.#owned = false;
      return this.#adapter;
    }
    if (this.#openFailed && !this.#opening) return null;
    this.#opening ??= this.#open()
      .then((adapter) => {
        this.#adapter = adapter;
        return adapter;
      })
      .finally(() => {
        this.#opening = undefined;
      });
    const result = await bounded(this.#opening, this.#timeout);
    if (result === "timeout") {
      this.#openFailed = true;
      this.#fail(new Error("open timed out"), "open");
      return null;
    }
    return result;
  }

  /** Never throws; a synchronous summary is suitable for diagnostics. */
  async record(record: JournalRecord): Promise<SafeRecordResult> {
    if (this.#closed) return { recorded: false, inserted: false, error: "closed" };
    const adapter = await this.#ensure();
    if (!adapter) return { recorded: false, inserted: false, error: null };
    try {
      const result = await bounded(adapter.record(record), this.#timeout);
      if (result === "timeout") {
        this.#fail(new Error("record timed out"), "record");
        return { recorded: false, inserted: false, error: "timed out" };
      }
      return { recorded: true, inserted: result.inserted, error: null };
    } catch (error) {
      this.#fail(error, "record");
      return { recorded: false, inserted: false, error: safeError(error) };
    }
  }

  /** Idempotent; never closes a caller-owned injected adapter. */
  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    const adapter = this.#adapter;
    if (adapter) {
      if (this.#owned) await this.#closeOwned(adapter);
      return;
    }
    // An open may still be in flight. Do not await it: shutdown must not hang.
    // Close the owned adapter once it arrives.
    const opening = this.#opening;
    if (opening) {
      void opening
        .then((late) => {
          if (late && this.#owned) return this.#closeOwned(late);
          return undefined;
        })
        .catch(() => undefined);
    }
  }

  async #closeOwned(adapter: JournalAdapter): Promise<void> {
    try {
      await bounded(adapter.close(), this.#timeout);
    } catch (error) {
      this.#fail(error, "close");
    }
  }
}
