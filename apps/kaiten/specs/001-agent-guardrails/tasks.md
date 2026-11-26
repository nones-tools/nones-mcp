# Tasks: Agent Guardrails & Server Modes (v3.4.0)

**Input**: Design documents from `/specs/001-agent-guardrails/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/env-config.md, contracts/tool-changes.md

**Tests**: REQUIRED (constitution IV: tests gate every change). Every implementation task pairs with tests; `bun test` + `bunx tsc --noEmit` + `bun run lint` must be green at every checkpoint.

**Organization**: Foundational config phase first (blocks everything), then user stories US1–US8 from spec.md in priority order. Executed by Sonnet subagents — every task is self-contained: read the referenced design docs before coding. Hard rules for every task: files ≤200 lines; `src/**` uses relative imports (`@/` only in `tests/**`); `src/kaiten/` imports nothing from outside itself; diagnostics to stderr only; no new runtime dependencies.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

No setup needed — existing repo, toolchain, and lint are in place. Verify baseline before starting:

- [x] T001 Run `bun test && bunx tsc --noEmit && bun run lint` at repo root and confirm green baseline (record any pre-existing failure — there should be none)

---

## Phase 2: Foundational — config fields & parsing (BLOCKS all stories)

**Purpose**: every guardrail reads config; land the fields once.

- [x] T002 Extend `KaitenConfig` in src/kaiten/interfaces/config.ts with the 12 new optional fields exactly as tabled in specs/001-agent-guardrails/data-model.md (`allowedColumnIds`, `allowedLaneIds`, `protectedColumnIds`, `enforceScope`, `readOnly`, `disabledTools`, `cardsLimit`, `minimalDefault`, `defaultColumnId`, `defaultLaneId`, `httpTimeoutMs`, `httpRetries`), each with a short doc comment; keep the file ≤200 lines
- [x] T003 Implement parsing in src/kaiten/config.ts: add `parseBool` (exact `'true'` case-insensitive, like `deleteAllow`), `parsePositiveInt`, `parseNonNegativeInt`, `parseNameList` (comma-separated trimmed non-empty strings → `string[] | null`); wire all 12 fields into `loadConfig`; malformed entries are skipped with a `console.error` warning naming the variable; wholly invalid value → field stays null/false; if config.ts would exceed 200 lines, move the small parsers to a new src/kaiten/config-parse.ts (core-internal) and import them
- [x] T004 Add `loadConfigLenient()` to src/kaiten/config.ts: identical merge+parse to `loadConfig` but never throws on missing `KAITEN_API_URL`/`KAITEN_API_TOKEN` (refactor shared body, do not duplicate); export it from the core barrel src/kaiten/index.ts and the package root src/index.ts (additive root export per contracts/tool-changes.md)
- [x] T005 Write tests/config-guardrails.test.ts: all 12 fields parse from env; precedence (process.env over `.kaiten.env`) reusing patterns from tests/config.test.ts; malformed values (`abc`, `-5`, empty string, `,,`) behave as unset without throwing; `loadConfigLenient` returns a config without credentials while `loadConfig` still throws; boolean flags reject `1`/`yes`/`TRUE `-with-space per exact-`'true'` semantics (trimmed value `TRUE` is valid, `yes` is not)

**Checkpoint**: `bun test` green; config surface complete — US1–US8 can start in parallel.

---

## Phase 3: US1 — Allowlist actually confines listing (P1) 🎯 MVP

**Goal**: space-wide card listing respects `KAITEN_ALLOWED_BOARD_IDS` and `KAITEN_DEFAULT_BOARD_ID` (FR-001..003, SC-001).

**Independent Test**: mock transport returning cards from boards 10 and 20; allowlist `[10]` → only board-10 cards; default board 10 + no boardId arg → listing scoped to board 10.

- [x] T006 [US1] In src/services/card.service.ts `getCards`: (a) when no `boardId` argument, fall back to `config.defaultBoardId` (extend the `Pick<KaitenConfig,...>` accordingly); (b) after fetching, filter the result to `config.allowedBoardIds` when set (cards keep `board_id`); guard's existing `validateSpaceId`/`validateBoardId` calls stay
- [x] T007 [P] [US1] Audit remaining list paths for the same leak: src/services/tag.service.ts (`getCardsWithTag`/`getCardsWithoutTag`) and any other service returning multi-board card lists (grep `getCards(` under src/services/); apply the same allowed-board filter; do NOT touch single-card paths (already guarded by `validateCardId`)
- [x] T008 [US1] Write tests/services-cards-filter.test.ts (US1 sections): board filtering of space-wide listing, default-board scoping when arg omitted, explicit boardId still wins over default, unchanged behavior when no allowlist/default set; use a mocked `KaitenApiPort` via `buildContainer` overrides like tests/services-guard.test.ts does
- [x] T009 [US1] Update any existing assertions in tests/sdk.test.ts / tests/mcp-tools.test.ts that encoded the leaking behavior; each changed assertion gets a `// FR-001..003 gap closure (specs/001-agent-guardrails)` comment and the eventual commit message carries the justification (constitution IV)

**Checkpoint**: US1 fully testable alone — MVP for the release.

---

## Phase 4: US2 — Column & lane guardrails (P1)

**Goal**: `KAITEN_ALLOWED_COLUMN_IDS` / `KAITEN_ALLOWED_LANE_IDS` / `KAITEN_PROTECTED_COLUMN_IDS` (FR-004, FR-005, SC-002). Read research.md §R5 first — it fixes the semantics.

- [x] T010 [US2] Extend src/services/guard.ts: `validateColumnTarget(columnId)` (rejects when allowlist set and id ∉ list, or id ∈ protected list), `validateLaneTarget(laneId)` (allowlist only); extend `validateCardId` to also reject when the fetched card's `column_id`/`lane_id` violates the allowlists (keep existing swallow-lookup-errors semantics: only confirmed violations throw); every error message names the exact env variable (FR-015); widen the guard's config `Pick` to the new fields; if guard.ts exceeds 200 lines, split scope logic into src/services/guard-scope.ts re-exported via src/services/index.ts
- [x] T011 [US2] In src/services/card.service.ts: filter `getCards` results by `allowedColumnIds`/`allowedLaneIds` when set; in `createCard`, `moveToColumn`, and `updateCard` call `guard.validateColumnTarget`/`validateLaneTarget` on the target column/lane — for `updateCard` inspect the merged patch keys `column_id`/`lane_id` (single enforcement point covers structured fields and the legacy `data` JSON, see research.md §R5)
- [x] T012 [P] [US2] Write tests/services-guard-scope.test.ts (US2 sections): matrix over allowed/protected columns and lanes — read filtering, create-into-disallowed rejected, move-to-protected rejected, update patch with `column_id` to protected rejected, card currently in disallowed column rejects operations, reads of protected columns pass, no variables → unchanged; assert error messages contain the variable names

**Checkpoint**: column/lane scoping complete and independently green.

---

## Phase 5: US3 — Read-only mode (P1)

**Goal**: `KAITEN_READ_ONLY=true` blocks all writes at the HTTP client (FR-007, SC-003). Mirror the DELETE gate exactly (src/kaiten/http/client.ts, src/kaiten/http/errors.ts, tests/http-delete-gate.test.ts are the models).

- [x] T013 [US3] Add `KaitenReadOnlyError` to src/kaiten/http/errors.ts (message: names `KAITEN_READ_ONLY`, says the server is read-only, instructs the agent to relay verbatim and never change the variable itself — copy the tone of `KaitenDeleteDisabledError`); export from src/kaiten/http/index.ts and the core barrel
- [x] T014 [US3] Add `readOnly?: boolean` to `KaitenClientOptions` in src/kaiten/http/client.ts; when true, `post`, `patch`, `putForm`, and `delete` throw `KaitenReadOnlyError` before any request (read-only wins over `allowDelete`); wire `readOnly: config.readOnly` in the client factory in src/di/container.ts next to `allowDelete`
- [x] T015 [P] [US3] Write tests/http-readonly-gate.test.ts modeled on tests/http-delete-gate.test.ts: post/patch/putForm/delete all throw `KaitenReadOnlyError` with no fetch call made (spy fetchImpl); get/getBuffer still work; readOnly+allowDelete=true still blocks delete; flag false/unset → writes pass through; plus an SDK-level test (mirroring tests/sdk-delete-gate.test.ts) proving `new KaitenSDK({readOnly: true, ...})` blocks e.g. `addComment`

**Checkpoint**: read-only unbypassable; all P1 stories done.

---

## Phase 6: US4 — Hard scope boundary (P2)

**Goal**: `KAITEN_ENFORCE_SCOPE=true` turns defaults into hard limits (FR-006, SC-004).

- [x] T016 [US4] In src/services/guard.ts (or guard-scope.ts): when `enforceScope` and `defaultSpaceId` set, `validateSpaceId` rejects explicit ids ≠ default; same for `validateBoardId`/`defaultBoardId`; `validateCardId` additionally rejects cards whose `board_id` ≠ `defaultBoardId` (when set); when `enforceScope` is true but both defaults are null, emit one `console.error` warning (inert flag) — emit it from `AccessGuard`'s constructor so it fires once per SDK instance, not per call
- [x] T017 [P] [US4] Extend tests/services-guard-scope.test.ts (US4 section): explicit space/board equal to default passes, different rejects with message naming `KAITEN_ENFORCE_SCOPE`, card on foreign board rejects, flag without defaults is inert (operations pass) and warns, flag off → unchanged; composition test: enforce-scope AND board-allowlist both configured → both checks apply (intersection)

---

## Phase 7: US5 — Trimming the tool surface (P2)

**Goal**: `KAITEN_DISABLED_TOOLS` hides tools from registration (FR-008). Read research.md §R6.

- [x] T018 [US5] In src/mcp/server.ts: call `loadConfigLenient()` once at startup; build `const disabled = new Set(config.disabledTools ?? [])`; skip registration for tools whose name is in the set; warn to stderr (`console.error`) listing any names that match no tool in the registry; remaining tools keep their loop order untouched
- [x] T019 [P] [US5] Write tests/mcp-disabled-tools.test.ts: extract/replicate the filtering as a pure function if needed for testability (e.g. export a small `filterTools(tools, disabledNames)` helper from src/mcp/tools/index.ts and use it in server.ts); assert: named tools absent, relative order of survivors identical to the frozen order in tests/mcp-tools.test.ts, unknown names ignored (and reported), empty/unset → full registry

---

## Phase 8: US6 — Token economy controls (P2)

**Goal**: `KAITEN_CARDS_LIMIT` + `KAITEN_MINIMAL_DEFAULT` (FR-009, FR-010, SC-005). Adapter layer only — SDK/CLI shapes unchanged (research.md §R7, §R8).

- [x] T020 [US6] Create src/mcp/tools/limit.ts: `applyCardsLimit<T>(cards: T[], limit: number | null)` returning the plain array when limit is null or not exceeded, else `{ truncated: true, total, returned, note, cards }` with `note` naming `KAITEN_CARDS_LIMIT` and suggesting narrowing filters (exact shape in data-model.md); keep it dependency-free
- [x] T021 [US6] In src/mcp/tools/cards.ts: `kaiten_cards` handler resolves `minimal: args.minimal ?? sdk.config.minimalDefault` and pipes its result through `applyCardsLimit(result, sdk.config.cardsLimit)`; `kaiten_find_cards` pipes its filtered projection through the same helper; tool names/schemas/descriptions unchanged except appending a sentence to the two descriptions mentioning possible truncation wrapper (additive doc text)
- [x] T022 [P] [US6] Write tests/mcp-cards-limit.test.ts driving the two tool handlers with a stub SDK (pattern: tests/mcp-tools.test.ts): limit unset → plain array; limit larger than result → plain array; truncation → wrapper with correct `total`/`returned` and `cards.length === limit`; `minimalDefault: true` → minimal shape by default, explicit `minimal: false` → full payload; `minimalDefault` unset → full payload as today

---

## Phase 9: US7 — Creation defaults for column and lane (P3)

**Goal**: `KAITEN_DEFAULT_COLUMN_ID` / `KAITEN_DEFAULT_LANE_ID` (FR-011). Read research.md §R9 and contracts/tool-changes.md.

- [x] T023 [US7] In src/services/card.service.ts: make `CreateCardInput.columnId` optional; `createCard` resolves `columnId ?? config.defaultColumnId` (error if neither, message naming both the parameter and `KAITEN_DEFAULT_COLUMN_ID`) and `laneId ?? config.defaultLaneId`; resolved targets still pass US2's `validateColumnTarget`/`validateLaneTarget`; update the `createCard` delegation signature in src/sdk.ts if needed (type flows from `CreateCardInput`)
- [x] T024 [US7] In src/mcp/tools/cards.ts `kaiten_create_card`: change `columnId` to `z.number().optional()` and update its description (and `laneId`'s) to mention the env defaults; no other schema change
- [x] T025 [P] [US7] Extend tests/services-cards-filter.test.ts (US7 section): default column used when omitted, explicit wins, neither → error mentioning both remedies, default lane applied, defaults still subject to column allowlist/protected checks; extend tests/mcp-tools.test.ts contract assertions: `columnId` now optional is asserted explicitly as an intentional 3.4.0 relaxation (comment referencing constitution 1.3.0 amendment), everything else about the schema unchanged

---

## Phase 10: US8 — Network robustness (P3)

**Goal**: `KAITEN_HTTP_TIMEOUT_MS` / `KAITEN_HTTP_RETRIES` (FR-012). Read research.md §R4.

- [x] T026 [US8] Create src/kaiten/http/policy.ts: `KaitenTimeoutError` lives in src/kaiten/http/errors.ts (add it there, message includes variable name, configured ms, method+path); `policy.ts` exports `fetchWithTimeout(fetchImpl, url, init, timeoutMs)` (AbortController + setTimeout, timer cleared/unref'd, abort → throw `KaitenTimeoutError`) and `isRetriable(error)` (fetch network `TypeError` or `KaitenApiError.status >= 500`); nothing in policy.ts imports from outside src/kaiten/
- [x] T027 [US8] In src/kaiten/http/client.ts: accept `timeoutMs?: number | null` and `retries?: number | null` in `KaitenClientOptions`; route `request`/`putForm`/`getBuffer` fetches through `fetchWithTimeout` when configured; retry loop ONLY for method === 'GET' (`request` GET path and `getBuffer`), up to `retries` extra attempts on `isRetriable` failures; writes never retried; wire both options from config in src/di/container.ts; keep client.ts ≤200 lines (the wrapper extraction into policy.ts is what buys the room — move shared response-parsing if still over)
- [x] T028 [P] [US8] Write tests/http-timeout-retry.test.ts with injected `fetchImpl`: timeout — fetch that resolves after 50ms with 10ms budget → `KaitenTimeoutError` naming the variable (use real short timers, no fake-timer dependency); retries — GET failing with network error twice then succeeding → success and 3 fetch calls; GET failing with 500 then 200 → success; GET failing with 404 → no retry; POST failing with network error → exactly 1 fetch call; both options unset → single attempt, no AbortController regression for putForm/getBuffer happy paths

**Checkpoint**: all user stories complete; full suite green.

---

## Phase 11: Polish & Cross-Cutting

- [x] T029 [P] Update docs/configuration.md: add all 12 variables to the table + a "Guardrails" section explaining tiers (HTTP gate vs service guard vs MCP adapter), intersection composition, the "guardrails are not token permissions" caveat, and the agent policy (never set/change guardrail variables; relay rejection errors verbatim — same wording style as the DELETE section); mirror the key points into README's configuration section if it lists variables
- [x] T030 [P] Update docs/tools.md (kaiten_cards/kaiten_find_cards truncation wrapper, kaiten_create_card optional columnId) and docs/sdk.md (`loadConfigLenient`, new `KaitenClientOptions`, optional `CreateCardInput.columnId`, new error classes)
- [x] T031 [P] Update AGENTS.md "Configuration the code needs at runtime" section: list the new optional variables in one line each, extend the "agents must never set" warning to cover `KAITEN_READ_ONLY` and the guardrail variables
- [x] T032 Amend .specify/memory/constitution.md to v1.3.0: Principle IV note that the parameter freeze forbids tightening (optional→required, type change, removal); required→optional relaxation where every previously valid call behaves identically is additive and allowed in a minor version; add amendment line at the bottom (motivating change: kaiten_create_card.columnId, this feature)
- [x] T033 Add `## Unreleased` section to CHANGELOG.md describing the feature set grouped as in contracts/env-config.md (Scope / Modes / Defaults & network + gap-fix note); follow the existing changelog voice
- [x] T034 Final gates: `bun test && bunx tsc --noEmit && bun run lint` all green; run a quick line-count check `find src -name '*.ts' | xargs wc -l | sort -n | tail` to confirm no file exceeds 200 lines; walk specs/001-agent-guardrails/quickstart.md automated section

---

## Dependencies & Execution Order

- **Phase 2 (T002–T005)** blocks everything.
- **US1 (T006–T009), US3 (T013–T015), US5 (T018–T019), US8 (T026–T028)** are mutually independent after Phase 2.
- **US2 (T010–T012)** touches card.service.ts — run after US1 to avoid same-file conflicts (or same agent does both).
- **US4 (T016–T017)** extends guard.ts — after US2.
- **US6 (T020–T022)** and **US7 (T023–T025)** touch src/mcp/tools/cards.ts — run US6 then US7 (or same agent); US7 also touches card.service.ts → after US2.
- **Polish (T029–T034)** last; T029–T031 parallel.

Suggested subagent waves (same-file conflicts respected):

1. Wave A: Phase 2 (one agent).
2. Wave B (parallel): {US1+US2+US4 — one agent, service/guard chain} • {US3 — one agent} • {US5 — one agent} • {US8 — one agent}.
3. Wave C (parallel after B): {US6+US7 — one agent, cards.ts chain}.
4. Wave D: Polish (docs tasks parallel, then T032–T034).

## Implementation Strategy

MVP = Phase 2 + US1 (allowlist finally honest). Each subsequent story is an
independent, individually testable increment; stop at any checkpoint with a green
suite. All work stays on the feature branch until final gates pass; release itself
(`bun run release minor` → 3.4.0) is a separate, human-approved step.
