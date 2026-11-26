# Data Model: Agent Guardrails & Server Modes (v3.4.0)

The only persistent "data" is configuration. One entity extended, no storage.

## KaitenConfig (extended) — `src/kaiten/interfaces/config.ts`

Existing fields unchanged. New optional fields (all with safe "unset" defaults):

| Field | Env var | Type | Default | Parse rule |
| --- | --- | --- | --- | --- |
| `allowedColumnIds` | `KAITEN_ALLOWED_COLUMN_IDS` | `number[] \| null` | `null` | `parseIntList`; empty/garbage-only → `null` |
| `allowedLaneIds` | `KAITEN_ALLOWED_LANE_IDS` | `number[] \| null` | `null` | same |
| `protectedColumnIds` | `KAITEN_PROTECTED_COLUMN_IDS` | `number[] \| null` | `null` | same |
| `enforceScope` | `KAITEN_ENFORCE_SCOPE` | `boolean` | `false` | `=== 'true'` case-insensitive (DELETE-gate semantics) |
| `readOnly` | `KAITEN_READ_ONLY` | `boolean` | `false` | same |
| `disabledTools` | `KAITEN_DISABLED_TOOLS` | `string[] \| null` | `null` | comma-separated, trimmed, non-empty entries; empty → `null` |
| `cardsLimit` | `KAITEN_CARDS_LIMIT` | `number \| null` | `null` | positive int; else `null` + warning |
| `minimalDefault` | `KAITEN_MINIMAL_DEFAULT` | `boolean` | `false` | `=== 'true'` |
| `defaultColumnId` | `KAITEN_DEFAULT_COLUMN_ID` | `number \| null` | `null` | positive int; else `null` + warning |
| `defaultLaneId` | `KAITEN_DEFAULT_LANE_ID` | `number \| null` | `null` | same |
| `httpTimeoutMs` | `KAITEN_HTTP_TIMEOUT_MS` | `number \| null` | `null` | positive int; else `null` + warning |
| `httpRetries` | `KAITEN_HTTP_RETRIES` | `number \| null` | `null` | non-negative int; else `null` + warning |

Sources & precedence: identical to existing fields (`~/.kaiten/config` → `./.env` →
`./.kaiten.env` → `process.env`; `overrides` param wins). All fields participate in
`KaitenSDKOptions`/`buildContainer(overrides)` automatically via `Partial<KaitenConfig>`.

## Derived concepts (no new types stored)

- **Effective scope** — intersection of all configured checks. Not materialized;
  computed per-operation by `AccessGuard`.
- **Write target** — the column/lane a create/move/update will place a card into.
  Validated against `allowedColumnIds`, `allowedLaneIds`, `protectedColumnIds`.
- **Truncated card list** (MCP adapter only) —
  `{ truncated: true, total: number, returned: number, note: string, cards: Card[] | MinimalCard[] }`;
  produced only when `cardsLimit` is set and exceeded, otherwise a plain array.

## New error types — `src/kaiten/http/errors.ts`

| Error | Thrown by | Message must include |
| --- | --- | --- |
| `KaitenReadOnlyError` | `KaitenClient.post/patch/putForm/delete` when `readOnly` | `KAITEN_READ_ONLY`, "relay to the user", "agents must never change this variable" |
| `KaitenTimeoutError` | request wrapper when timeout fires | `KAITEN_HTTP_TIMEOUT_MS`, configured ms, method+path |

Guard rejections remain plain `Error`s (existing pattern) but every message names the
responsible variable (FR-015).

## State transitions

None. All guardrails are stateless per-request checks derived from immutable config
loaded at SDK construction.
