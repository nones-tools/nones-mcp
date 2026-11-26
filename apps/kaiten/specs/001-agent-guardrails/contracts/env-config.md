# Contract: Guardrail Environment Variables (v3.4.0)

Operator-facing contract. All variables optional; unset = today's behavior.
Boolean flags: only the literal `true` (case-insensitive) enables. List values:
comma-separated; whitespace around entries ignored; empty value = unset.

## Scope

| Variable | Effect |
| --- | --- |
| `KAITEN_ALLOWED_COLUMN_IDS` | Reads: card lists contain only these columns. Writes: creating/moving/updating a card into any other column is rejected; operating on a card currently outside these columns is rejected. |
| `KAITEN_ALLOWED_LANE_IDS` | Same semantics for lanes. |
| `KAITEN_PROTECTED_COLUMN_IDS` | Write-target ban only: create-in/move-to/update-into these columns is rejected. Reading, and operating on cards already there, is allowed. |
| `KAITEN_ENFORCE_SCOPE` | `true` → `KAITEN_DEFAULT_SPACE_ID`/`KAITEN_DEFAULT_BOARD_ID` become hard boundaries: explicit ids that differ are rejected; card operations verify the card belongs to the default board. No defaults set → inert + stderr warning. |
| (gap fix) `KAITEN_ALLOWED_BOARD_IDS` | Now also filters space-wide card listings (previously leaked all boards). |
| (gap fix) `KAITEN_DEFAULT_BOARD_ID` | Now scopes card listing when no explicit board is passed. |

## Modes

| Variable | Effect |
| --- | --- |
| `KAITEN_READ_ONLY` | `true` → every POST/PATCH/PUT/DELETE is blocked in the HTTP client with `KaitenReadOnlyError` before any request is sent. Overrides `KAITEN_API_DELETE_ALLOW`. |
| `KAITEN_DISABLED_TOOLS` | Comma-separated MCP tool names; listed tools are not registered (absent from `tools/list`). Unknown names: warning to stderr, ignored. Order of remaining tools unchanged. |
| `KAITEN_CARDS_LIMIT` | Positive integer N. `kaiten_cards` / `kaiten_find_cards` return at most N cards; when truncation occurs the response is `{ truncated: true, total, returned, note, cards: [...] }`, otherwise the plain array as today. |
| `KAITEN_MINIMAL_DEFAULT` | `true` → `kaiten_cards` defaults to the minimal projection; explicit `minimal: false` still returns the full payload. |

## Defaults & network

| Variable | Effect |
| --- | --- |
| `KAITEN_DEFAULT_COLUMN_ID` / `KAITEN_DEFAULT_LANE_ID` | Used by card creation when `columnId`/`laneId` are omitted. Explicit arguments win. Neither configured nor passed (column) → actionable error naming both remedies. |
| `KAITEN_HTTP_TIMEOUT_MS` | Positive integer; each HTTP request aborts after this many ms with `KaitenTimeoutError`. Unset → no timeout (today). |
| `KAITEN_HTTP_RETRIES` | Non-negative integer N; **GET requests only** are retried up to N times on network errors or HTTP >= 500. Writes are never retried. Unset/0 → no retries (today). |

## Cross-cutting guarantees

- Composition is intersection: an operation must satisfy every configured guardrail.
- Malformed values never crash the server: bad entries are skipped with a stderr warning; a wholly invalid value behaves as unset.
- Every rejection error names the variable that caused it and instructs the AI agent to relay the message to the user; agents must never set or change guardrail variables themselves (same policy as `KAITEN_API_DELETE_ALLOW`).
- Guardrails constrain the agent using this server — they are **not** a substitute for Kaiten API-token permissions.
- Sources and precedence: `~/.kaiten/config` → `./.env` → `./.kaiten.env` → environment, identical to existing variables.
