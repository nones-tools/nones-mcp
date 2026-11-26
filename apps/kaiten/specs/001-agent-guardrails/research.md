# Research: Agent Guardrails & Server Modes (v3.4.0)

Phase 0 findings. All spec-level unknowns resolved; no NEEDS CLARIFICATION remain.

## R1. Where each guardrail is enforced

**Decision**: three enforcement tiers, matching the existing architecture:

| Tier | Guardrails | Precedent |
| --- | --- | --- |
| Core HTTP client (`KaitenClient`) | `KAITEN_READ_ONLY`, `KAITEN_HTTP_TIMEOUT_MS`, `KAITEN_HTTP_RETRIES` | existing DELETE gate (`allowDelete` option) — cannot be bypassed by any tool/service/SDK path |
| Services (`AccessGuard`, `CardService`) | allowlists (space/board/column/lane), protected columns, enforce-scope, listing filters, create defaults | existing `AccessGuard` + `getSpaces()` filter |
| MCP adapter (`server.ts`, `tools/cards.ts`) | `KAITEN_DISABLED_TOOLS`, `KAITEN_CARDS_LIMIT`, `KAITEN_MINIMAL_DEFAULT` | tool registry loop; `minimal`/`simple` flags |

**Rationale**: read-only must be unbypassable → lowest layer. Scope semantics need
domain knowledge (card→board/column lookup) → services. Tool hiding and response
shaping are protocol/token concerns → adapter.

**Alternatives considered**: everything in a new MCP hook (middleware) — rejected:
hooks see tool names/args but lack domain context (card→column resolution), and CLI/SDK
would bypass them entirely.

## R2. Column filtering server-side vs API-side

**Decision**: filter in-memory in `CardService` after fetching (`card.column_id` /
`card.lane_id` are present on every card). Write-target validation in `AccessGuard`.

**Rationale**: the per-space cards endpoint used today doesn't take column filters;
the guarantee we sell is "what the agent sees", not payload size. No extra API calls.

**Alternatives**: switching to Kaiten's generic `/cards?column_id=` endpoint —
rejected for this release: changes the request contract of `CardsApi.getCards` and
risks pagination/behavior differences; can be a later optimization inside the core.

## R3. Read-only gate design

**Decision**: new `KaitenClientOptions.readOnly?: boolean` (default false). When true,
`post`, `patch`, `putForm`, and `delete` throw a new `KaitenReadOnlyError` (in
`http/errors.ts`, sibling of `KaitenDeleteDisabledError`) *before* any request.
Read-only wins over `allowDelete`. `getBuffer`/`get` unaffected. Container factory
passes `readOnly: config.readOnly` (same wiring as `allowDelete`).

**Error text** (agent-relay pattern, like the DELETE error): names
`KAITEN_READ_ONLY`, says the server is in read-only mode, instructs the agent to
relay to the user and never set the variable itself.

## R4. Timeout & retries

**Decision**: implement in a new core-internal `src/kaiten/http/policy.ts`:
- `withTimeout(fetchImpl, ms)`: wraps a fetch call with `AbortController` +
  `setTimeout` (Node >= 18 native); on abort throws `KaitenTimeoutError` naming
  `KAITEN_HTTP_TIMEOUT_MS` and the configured value. `AbortSignal.timeout()` is
  avoided in favor of an explicit controller so the error is our typed error, and
  timers are `unref`'d where available.
- `withRetries(fn, n, isRetriable)`: retries only when the request is a **GET** and
  the failure is transient — a thrown network error (fetch `TypeError`) or a
  `KaitenApiError` with status >= 500. POST/PATCH/PUT/DELETE are never retried
  (non-idempotent). No backoff sophistication: simple immediate retry up to N —
  small, predictable, testable (constitution I).

**Defaults**: both unset → exactly current behavior (no timeout, no retry). Parsing:
non-numeric/negative → treated as unset + stderr warning.

## R5. Guard extension & composition semantics

**Decision**: extend `AccessGuard` with:
- `validateColumnTarget(columnId)` — rejects if `allowedColumnIds` set and columnId ∉ list, **or** `protectedColumnIds` contains columnId.
- `validateLaneTarget(laneId)` — same for lanes (allowlist only; protection is column-scoped per spec).
- `validateCardId(cardId)` extended: after the existing board check, also rejects when the card's current `column_id`/`lane_id` violates the allowlists, and (enforce-scope) when the card's board ≠ `defaultBoardId`. Keeps the existing "only confirmed violations reject; lookup failures never mask" semantics.
- `validateSpaceId`/`validateBoardId` extended: when `enforceScope` and the corresponding default is set, an explicit id differing from the default rejects.

Composition = intersection: every configured check runs; first violation throws.
If `guard.ts` exceeds 200 lines, split scope checks into `guard-scope.ts` re-exported
via `services/index.ts`.

**Move semantics**: `moveToColumn`/`updateCard`(with `column_id`)/`createCard` call
`validateColumnTarget`/`validateLaneTarget` on the *target*; `validateCardId` covers
the card's *current* position. `kaiten_update_card`'s legacy `data` JSON is parsed in
the tool handler already — the service receives the merged patch, so the service
inspects `column_id`/`lane_id`/`board_id` keys of the patch (single enforcement point
for both structured and legacy paths).

## R6. Tool hiding (`KAITEN_DISABLED_TOOLS`)

**Decision**: parse in `loadConfig` (uniform sources/precedence). `server.ts` needs it
*before* credentials exist, and `loadConfig` throws without URL/token → add
`loadConfig({ requireCredentials: false })`-style optional behavior via a new exported
helper `loadConfigLenient()` in `src/kaiten/config.ts` that performs the same merge and
parse but skips the required-vars throw. `server.ts` calls it once at startup to get
`disabledTools` (and nothing else). Root export additive (`loadConfigLenient`).
Registration loop: `for (const tool of tools) if (!disabled.has(tool.name)) register`.
Unknown names → `console.error` warning listing them. Relative order of remaining
tools is automatically preserved.

**Alternatives**: reading `process.env` directly in server.ts — rejected (misses the
three file sources); making `loadConfig` never throw — rejected (breaks the
actionable-error contract).

## R7. Cards limit & truncation shape

**Decision**: applied at the MCP adapter layer only (SDK/CLI callers are not
context-constrained agents; SDK behavior unchanged). Shared helper
`src/mcp/tools/limit.ts`:

```
applyCardsLimit(cards, limit) →
  limit unset or cards.length <= limit  → cards (plain array, shape unchanged)
  else → { truncated: true, total, returned, note, cards: cards.slice(0, limit) }
```

`note` is a one-line human/agent-readable string ("list truncated to N of M by
KAITEN_CARDS_LIMIT; narrow with boardId/columnId filters"). Used by `kaiten_cards`
and `kaiten_find_cards`. The wrapped shape appears **only** when the opt-in variable
is set *and* truncation actually occurred — existing consumers see today's array
otherwise. Spec FR-009's "does not break consumers iterating" is satisfied: the
`cards` key still holds a plain array, and without the variable nothing changes.

## R8. Minimal-by-default

**Decision**: `kaiten_cards` handler: `minimal: args.minimal ?? config.minimalDefault`.
Explicit `minimal: false` still returns full payload (explicit wins — `??` only fills
`undefined`). `kaiten_card` already defaults to minimal; unchanged.

## R9. Creation defaults & the required→optional question

**Decision**: `CreateCardInput.columnId` becomes optional; `CardService.createCard`
resolves `columnId ?? config.defaultColumnId` and `laneId ?? config.defaultLaneId`,
throwing an actionable error naming both remedies when neither source provides a
column. MCP schema: `columnId: z.number().optional()` with updated description.
`boardId` stays required in the schema but the handler/service falls back to
`config.defaultBoardId` when omitted? — **No**: `boardId` remains required (changing
it is out of scope; only column/lane defaults were requested). Constitution note:
1.3.0 amendment text clarifies the parameter freeze forbids tightening
(optional→required, type change, removal), while required→optional relaxation with
identical behavior for all previously valid calls is additive.

## R10. Config parsing

**Decision**: extend `loadConfig` with the 12 new fields (see data-model.md). Shared
tiny parsers: `parseIntList` (exists), `parseBool` (mirrors DELETE-gate `=== 'true'`
semantics), `parsePositiveInt` (returns null + warning on garbage), `parseNameList`
(comma-separated trimmed non-empty strings). If `config.ts` exceeds 200 lines, move
parsers to `src/kaiten/config-parse.ts` (core-internal, imported by config.ts).
Malformed entries: skip entry + stderr warning; entirely invalid value = unset.
Empty lists (``/`,,`) → null (unset), never "allow nothing".

## R11. Test strategy

Mocked `HttpTransport`/`fetchImpl` throughout (no network), per existing test files:
- config parsing/precedence/malformed → `config-guardrails.test.ts`
- HTTP gates: readonly (mirror `http-delete-gate.test.ts`), timeout (fake fetch that never resolves + fake timers or real 5–10 ms timeouts), retries (fetch failing K times then succeeding; assert writes not retried)
- guard scope matrix → `services-guard-scope.test.ts`
- card service filtering/defaults → `services-cards-filter.test.ts`
- MCP: disabled tools (registry filtering — test the filtering function/`tools` list, not a live server), limit/truncation/minimal-default via tool handlers with stub SDK
- contract regression: `mcp-tools.test.ts` frozen-order list unchanged; `kaiten_create_card` columnId optionality asserted additively; justification lines in commit message for FR-001..003 assertion updates.
