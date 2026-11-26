/**
 * Kaiten SDK configuration shape, as produced by `loadConfig()`.
 */
export interface KaitenConfig {
  apiUrl: string;
  apiToken: string;
  defaultSpaceId: number | null;
  defaultBoardId: number | null;
  allowedSpaceIds: number[] | null;
  allowedBoardIds: number[] | null;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  /**
   * Explicit opt-in gate for HTTP DELETE calls to the Kaiten API. Only `true`
   * when `KAITEN_API_DELETE_ALLOW` is exactly `'true'` (case-insensitive).
   * Not part of the required-config check - safe default is `false`.
   */
  deleteAllow: boolean;
  /** `KAITEN_ALLOWED_COLUMN_IDS` - reads/writes confined to these columns; `null` = unrestricted. */
  allowedColumnIds: number[] | null;
  /** `KAITEN_ALLOWED_LANE_IDS` - reads/writes confined to these lanes; `null` = unrestricted. */
  allowedLaneIds: number[] | null;
  /** `KAITEN_PROTECTED_COLUMN_IDS` - write-target ban only (reads unaffected); `null` = none protected. */
  protectedColumnIds: number[] | null;
  /** `KAITEN_ENFORCE_SCOPE` - `true` turns `defaultSpaceId`/`defaultBoardId` into hard boundaries. */
  enforceScope: boolean;
  /** `KAITEN_READ_ONLY` - `true` blocks every HTTP write (POST/PATCH/PUT/DELETE) before any request. */
  readOnly: boolean;
  /** `KAITEN_DISABLED_TOOLS` - comma-separated MCP tool names to omit from registration. */
  disabledTools: string[] | null;
  /** `KAITEN_CARDS_LIMIT` - positive int cap on cards returned by listing tools; `null` = unlimited. */
  cardsLimit: number | null;
  /** `KAITEN_MINIMAL_DEFAULT` - `true` makes `kaiten_cards` default to the minimal projection. */
  minimalDefault: boolean;
  /** `KAITEN_DEFAULT_COLUMN_ID` - fallback column for card creation when `columnId` is omitted. */
  defaultColumnId: number | null;
  /** `KAITEN_DEFAULT_LANE_ID` - fallback lane for card creation when `laneId` is omitted. */
  defaultLaneId: number | null;
  /** `KAITEN_HTTP_TIMEOUT_MS` - positive int; aborts HTTP requests after this many ms; `null` = no timeout. */
  httpTimeoutMs: number | null;
  /** `KAITEN_HTTP_RETRIES` - non-negative int; extra retry attempts for GET requests only; `null` = no retries. */
  httpRetries: number | null;
}

export type ConfigSource = 'process env' | 'explicit config-file' | '.kaiten.env' | '.env' | '~/.kaiten/config' | null;

/** Safe-to-display configuration state. It deliberately contains no secrets. */
export interface KaitenConfigHealth {
  cwd: string;
  apiUrl: { present: boolean; source: ConfigSource; origin: string | null };
  apiToken: { present: boolean; source: ConfigSource };
  ready: boolean;
  actions: string[];
  errorCode?: 'INVALID_CONFIGURATION';
}
