/** Version of the journal adapter contract. Incompatible changes bump this. */
export const JOURNAL_API_VERSION = 1;

export const JOURNAL_OUTCOMES = ["success", "failure", "cancelled"] as const;

export type JournalOutcome = (typeof JOURNAL_OUTCOMES)[number];

/** One completed CLI operation. Times are canonical UTC ISO-8601 strings. */
export interface JournalRecord {
  /** Client supplied, stable across retries; duplicate IDs are not re-inserted. */
  id: string;
  at: string;
  /** Integration-owned, namespaced operation name, e.g. opencode-mcp.prompt.send. */
  operation: string;
  outcome: JournalOutcome;
  durationMs: number;
  /** Native OpenCode session identifier, when one exists. */
  sessionId?: string;
  /** Session title history, when the caller already has it. */
  sessionTitle?: string;
  /** Native message identifier, when one exists. */
  messageId?: string;
  /** Full user authorized prompt text; never tool output or incidental data. */
  prompt?: string;
}

/** Optional filters shared by queries and stats. `from` is inclusive, `to` exclusive. */
export interface JournalFilter {
  operation?: string;
  operationPrefix?: string;
  outcome?: JournalOutcome;
  sessionId?: string;
  from?: string;
  to?: string;
}

/** Bounded, cursor ordered read. Cursors are opaque and stable across restarts. */
export interface JournalQuery {
  filter?: JournalFilter;
  limit?: number;
  cursor?: string;
}

export interface JournalRecordResult {
  id: string;
  /** False when the ID already existed; the original record is preserved. */
  inserted: boolean;
}

export interface JournalPage {
  records: JournalRecord[];
  /** Opaque cursor for the next page, or null when the page is complete. */
  next: string | null;
}

export interface JournalOutcomeCount {
  outcome: JournalOutcome;
  count: number;
}

export interface JournalOperationCount {
  operation: string;
  count: number;
  averageDurationMs: number;
}

/** Deterministic aggregates; ordering does not depend on database row order. */
export interface JournalStats {
  total: number;
  firstAt: string | null;
  lastAt: string | null;
  byOutcome: JournalOutcomeCount[];
  byOperation: JournalOperationCount[];
}

/**
 * Adapter surface. Every method is async so an external driver can be backed by
 * a remote store. Each instance owns one connection and closes only itself.
 */
export interface JournalAdapter {
  readonly apiVersion: typeof JOURNAL_API_VERSION;
  record(record: JournalRecord): Promise<JournalRecordResult>;
  query(query?: JournalQuery): Promise<JournalPage>;
  stats(filter?: JournalFilter): Promise<JournalStats>;
  close(): Promise<void>;
}

/**
 * A custom adapter module default export. `create` receives the configured JSON
 * options unchanged. The module must be selected explicitly in user config.
 */
export interface JournalAdapterFactory {
  readonly apiVersion: typeof JOURNAL_API_VERSION;
  create(options: unknown): JournalAdapter | Promise<JournalAdapter>;
}

export interface JournalAdapterSelection {
  /** Original configured module specifier, for diagnostics. */
  module: string;
  /** Resolved file URL; relative specs resolve against the config file. */
  moduleUrl: string;
  options?: unknown;
}
