/**
 * Journal contract shared by core and adapters. The SQLite implementation
 * lands with OpenCode 0.5.0; core validates settings but never opens them.
 */
export interface JournalAdapterRef {
  module: string;
  options: Record<string, unknown>;
}

/**
 * Journal settings. Normalized from the legacy top-level `journal` object in
 * config.json (standalone OpenCode 0.5.0) or an optional journal.json.
 */
export interface JournalSettings {
  enabled: boolean;
  capturePrompts: boolean;
  sqlitePath: string | null;
  adapter: JournalAdapterRef | null;
  /** Where the settings came from, for diagnostics. */
  source: "config.json#journal" | "journal.json" | "default";
}

/**
 * Shared journal adapter contract. The SQLite implementation lands with
 * OpenCode 0.5.0; core deliberately ships no adapter yet.
 */
export interface JournalRecord {
  id: string;
  recordedAt: string;
  moduleId: string;
  kind: string;
  payload: unknown;
}

export interface JournalAdapter {
  readonly kind: "sqlite";
  open(settings: Readonly<JournalSettings>): Promise<void>;
  append(record: JournalRecord): Promise<void>;
  close(): Promise<void>;
}
