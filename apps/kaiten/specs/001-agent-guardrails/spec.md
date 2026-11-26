# Feature Specification: Agent Guardrails & Server Modes (v3.4.0)

**Feature Branch**: `001-agent-guardrails`

**Created**: 2026-07-21

**Status**: Draft

**Input**: User description: "Конфигурируемые ограничения области работы и режимы сервера для ИИ-агента (v3.4.0): закрытие дыр allowlist, KAITEN_ALLOWED_COLUMN_IDS / KAITEN_ALLOWED_LANE_IDS, KAITEN_PROTECTED_COLUMN_IDS, KAITEN_ENFORCE_SCOPE, KAITEN_READ_ONLY, KAITEN_DISABLED_TOOLS, KAITEN_CARDS_LIMIT, KAITEN_MINIMAL_DEFAULT, KAITEN_DEFAULT_COLUMN_ID / KAITEN_DEFAULT_LANE_ID, KAITEN_HTTP_TIMEOUT_MS / KAITEN_HTTP_RETRIES."

## Overview

The server is operated by humans but *used* by AI agents. Today the only scoping
controls are space/board allowlists (with enforcement gaps) and a DELETE gate. This
feature adds a coherent set of **opt-in guardrails** — narrower scoping (columns,
lanes, hard space/board boundary), safer modes (read-only, tool hiding, protected
columns), and token/robustness controls (result limits, minimal projections, HTTP
timeout/retries). Every control is an optional environment variable; with none set,
observable behavior is unchanged except where an existing allowlist promise was not
actually enforced (closing those gaps is a bug fix, not a behavior break).

All guardrails constrain what the *agent* can do through this server. They are not a
substitute for API-token permissions, and documentation must say so explicitly.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Allowlist actually confines listing (Priority: P1)

An operator sets `KAITEN_ALLOWED_BOARD_IDS` expecting the agent to only ever see one
project's boards. Today a space-wide card listing still returns cards from *all*
boards of the space. After this feature, every card returned by any listing/search
tool belongs to an allowed board, and board-scoped defaults are respected by listing.

**Why this priority**: The variable already exists and its documentation promises
"operations outside it are rejected" — the gap silently leaks out-of-scope data into
the agent context. Everything else builds on a trustworthy allowlist.

**Independent Test**: Configure an allowlist of one board, list cards for the whole
space, verify only that board's cards are returned; verify `KAITEN_DEFAULT_BOARD_ID`
narrows listing when no board is passed explicitly.

**Acceptance Scenarios**:

1. **Given** `KAITEN_ALLOWED_BOARD_IDS=10`, **When** the agent lists cards of a space containing boards 10 and 20, **Then** only cards with board 10 are returned.
2. **Given** `KAITEN_DEFAULT_BOARD_ID=10` and no explicit board argument, **When** the agent lists cards, **Then** the listing is scoped to board 10.
3. **Given** `KAITEN_ALLOWED_BOARD_IDS=10`, **When** the agent requests a single card that lives on board 20, **Then** the request is rejected with an error naming the allowlist.
4. **Given** no allowlist variables set, **When** any tool is called, **Then** behavior is identical to v3.3.

---

### User Story 2 - Column & lane guardrails (Priority: P1)

An operator wants the agent to work only inside specific columns (e.g. "Backlog" and
"In Progress") and never touch or move cards into protected columns (e.g. "Done",
"Deploy"). They set `KAITEN_ALLOWED_COLUMN_IDS` / `KAITEN_ALLOWED_LANE_IDS`
(visibility + operations) and/or `KAITEN_PROTECTED_COLUMN_IDS` (write-target ban
only).

**Why this priority**: This is the core new scoping capability requested — column-level
narrowing was previously impossible.

**Independent Test**: With a column allowlist set, list cards and verify filtering;
attempt create/move into a non-allowed or protected column and verify rejection.

**Acceptance Scenarios**:

1. **Given** `KAITEN_ALLOWED_COLUMN_IDS=100,101`, **When** the agent lists cards, **Then** only cards in columns 100/101 are returned.
2. **Given** `KAITEN_ALLOWED_COLUMN_IDS=100,101`, **When** the agent tries to create a card in, move a card to, or modify a card currently in column 102, **Then** the operation is rejected with an error naming the restriction.
3. **Given** `KAITEN_PROTECTED_COLUMN_IDS=200`, **When** the agent tries to move or create a card **into** column 200, **Then** the operation is rejected; **When** it reads cards in column 200, **Then** reading succeeds.
4. **Given** `KAITEN_ALLOWED_LANE_IDS=5`, **When** the agent lists cards, **Then** only lane-5 cards are returned, and card writes targeting other lanes are rejected.
5. **Given** none of these variables, **Then** column/lane behavior is unchanged.

---

### User Story 3 - Read-only mode (Priority: P1)

An operator wants an agent that can *see* the board but never change it. Setting
`KAITEN_READ_ONLY=true` blocks every state-changing call at the lowest layer, the
same way the existing DELETE gate does, so no tool, service, or SDK path can bypass
it.

**Why this priority**: The strongest, simplest safety switch; frequently requested
for "analyst" agents.

**Independent Test**: With the flag on, any write tool returns an actionable error;
all read tools keep working.

**Acceptance Scenarios**:

1. **Given** `KAITEN_READ_ONLY=true`, **When** the agent calls any tool that creates/updates/deletes anything, **Then** the call fails with an error explaining read-only mode and how to disable it, and no request reaches Kaiten.
2. **Given** `KAITEN_READ_ONLY=true`, **When** the agent calls listing/read tools, **Then** they work normally.
3. **Given** the flag unset or any value other than `true` (case-insensitive), **Then** writes behave as before.

---

### User Story 4 - Hard scope boundary (Priority: P2)

An operator with a "one board = one project" setup already sets the default
space/board. Setting `KAITEN_ENFORCE_SCOPE=true` turns those defaults into a hard
boundary: explicit arguments pointing outside the defaults are rejected instead of
honored. This gives single-board confinement without maintaining allowlists.

**Independent Test**: With enforce-scope on and a default board set, pass a different
explicit board id and verify rejection.

**Acceptance Scenarios**:

1. **Given** `KAITEN_ENFORCE_SCOPE=true` and `KAITEN_DEFAULT_BOARD_ID=10`, **When** the agent passes board 20 explicitly to any tool, **Then** the call is rejected with an error naming the enforced scope.
2. **Given** `KAITEN_ENFORCE_SCOPE=true` and `KAITEN_DEFAULT_SPACE_ID=1`, **When** the agent passes space 2, **Then** the call is rejected.
3. **Given** `KAITEN_ENFORCE_SCOPE=true` and a default board, **When** the agent operates on a card belonging to another board, **Then** the operation is rejected.
4. **Given** `KAITEN_ENFORCE_SCOPE=true` but no defaults set, **Then** the flag has no effect (nothing to enforce), and a diagnostic warning is emitted.

---

### User Story 5 - Trimming the tool surface (Priority: P2)

An operator lists tool names in `KAITEN_DISABLED_TOOLS`; those tools are not
registered at all, so the agent never sees them — shrinking both the attack surface
and the agent's context window.

**Independent Test**: Disable two tools, list tools over the protocol, verify they
are absent and all others are present in unchanged relative order.

**Acceptance Scenarios**:

1. **Given** `KAITEN_DISABLED_TOOLS=kaiten_delete_card,kaiten_move_card`, **When** the client lists tools, **Then** those two are absent and the remaining tools keep their relative order.
2. **Given** a name in the list that matches no tool, **Then** the server still starts, ignores it, and emits a diagnostic warning naming the unknown entry.
3. **Given** the variable unset or empty, **Then** all tools are registered as before.

---

### User Story 6 - Token economy controls (Priority: P2)

Large boards flood the agent context. `KAITEN_CARDS_LIMIT` caps how many cards any
listing/search returns (with an explicit truncation indicator), and
`KAITEN_MINIMAL_DEFAULT=true` makes card listing default to the compact projection
while an explicit request for the full payload still wins.

**Independent Test**: Set a limit of 5 on a board with more cards, verify 5 returned
plus a truncation indicator with the total count; set minimal-default and verify the
compact shape is returned unless the full payload is explicitly requested.

**Acceptance Scenarios**:

1. **Given** `KAITEN_CARDS_LIMIT=5` and a board with 12 matching cards, **When** the agent lists or searches cards, **Then** exactly 5 cards are returned together with an indication that 12 existed and the list was truncated.
2. **Given** `KAITEN_CARDS_LIMIT=5` and 3 matching cards, **Then** 3 cards are returned with no truncation indicator.
3. **Given** `KAITEN_MINIMAL_DEFAULT=true`, **When** the agent lists cards without specifying a format, **Then** the compact projection is returned; **When** it explicitly asks for the full payload, **Then** the full payload is returned.
4. **Given** neither variable set, **Then** response shapes and sizes are unchanged.

---

### User Story 7 - Creation defaults for column and lane (Priority: P3)

An operator sets `KAITEN_DEFAULT_COLUMN_ID` / `KAITEN_DEFAULT_LANE_ID` so the agent
can create cards without first discovering column/lane ids, and new cards land in the
intended place instead of the board's implicit default lane.

**Independent Test**: With defaults set, create a card without column/lane arguments
and verify it targets the configured column/lane; explicit arguments still win.

**Acceptance Scenarios**:

1. **Given** `KAITEN_DEFAULT_COLUMN_ID=100`, **When** the agent creates a card without a column, **Then** the card is created in column 100.
2. **Given** the same, **When** the agent passes column 101 explicitly, **Then** 101 wins.
3. **Given** no default column configured, **When** the agent omits the column, **Then** the call fails with an error explaining that a column id or `KAITEN_DEFAULT_COLUMN_ID` is required (today's required-argument behavior, with a better message).

---

### User Story 8 - Network robustness (Priority: P3)

Flaky corporate networks currently surface as raw fetch failures with no bound on
hang time. `KAITEN_HTTP_TIMEOUT_MS` bounds each request; `KAITEN_HTTP_RETRIES`
retries *safe* (read) requests on transient failures.

**Independent Test**: Simulate a hanging/failing transport and verify timeout
triggers and reads are retried the configured number of times while writes are not.

**Acceptance Scenarios**:

1. **Given** `KAITEN_HTTP_TIMEOUT_MS=1000`, **When** a request takes longer, **Then** it fails with a timeout error naming the configured limit.
2. **Given** `KAITEN_HTTP_RETRIES=2`, **When** a read request fails transiently twice then succeeds, **Then** the caller sees success; **When** a write request fails, **Then** it is not retried.
3. **Given** neither variable, **Then** requests behave exactly as today (no timeout, no retries).

---

### Edge Cases

- Conflicting guardrails compose as **intersection**: a card/operation must pass *every* configured check (allowlists, enforce-scope, protected columns, read-only). The most restrictive answer wins.
- Malformed values (non-numeric ids in a list, negative limit, non-numeric timeout) are ignored per-entry where possible, with a diagnostic warning; a wholly invalid variable behaves as unset. The server must never crash on bad guardrail config.
- `KAITEN_READ_ONLY=true` together with `KAITEN_API_DELETE_ALLOW=true`: read-only wins (deletes are writes).
- Empty list values (``, `,,`) behave as unset, not as "allow nothing".
- Truncation indicator must not break consumers that iterate the returned card list.
- Boolean flags accept only `true` (case-insensitive) as enabled — mirroring the existing DELETE gate.
- A card whose column/lane cannot be determined during a guard check must not be silently blocked by an unrelated lookup failure (mirrors existing guard semantics: only confirmed violations reject).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Card listing and search MUST return only cards whose board is in `KAITEN_ALLOWED_BOARD_IDS` when that variable is set (closing the current space-wide leak).
- **FR-002**: Card listing MUST scope to `KAITEN_DEFAULT_BOARD_ID` when set and no explicit board argument is given.
- **FR-003**: All services performing space/board/card-addressed operations MUST consistently apply the existing allowlist checks (audit and close remaining gaps).
- **FR-004**: When `KAITEN_ALLOWED_COLUMN_IDS` (resp. `KAITEN_ALLOWED_LANE_IDS`) is set: read results MUST be filtered to allowed columns (lanes); create/move/update operations targeting — or addressing cards currently in — non-allowed columns (lanes) MUST be rejected with an error naming the restriction.
- **FR-005**: When `KAITEN_PROTECTED_COLUMN_IDS` is set, any operation whose *target* column is protected (create-in, move-to, update-into) MUST be rejected; reads and operations merely *addressing* cards already in protected columns MUST NOT be restricted by this variable.
- **FR-006**: When `KAITEN_ENFORCE_SCOPE=true`, explicit space/board arguments differing from the configured defaults MUST be rejected, and card-addressed operations MUST verify the card belongs to the default board (when a default board is set). With no defaults configured the flag is inert and a diagnostic warning is emitted.
- **FR-007**: When `KAITEN_READ_ONLY=true`, every state-changing request MUST be blocked before leaving the server, at a layer no tool/service/SDK path can bypass, with an actionable error; read requests are unaffected. Read-only overrides `KAITEN_API_DELETE_ALLOW`.
- **FR-008**: Tools named in `KAITEN_DISABLED_TOOLS` (comma-separated) MUST NOT be registered; remaining tools keep their relative order; unknown names produce a diagnostic warning and are ignored.
- **FR-009**: When `KAITEN_CARDS_LIMIT=N` is set, card listing/search responses MUST contain at most N cards and MUST indicate truncation including the total available count, in a way that does not break consumers iterating the card list.
- **FR-010**: When `KAITEN_MINIMAL_DEFAULT=true`, card listing defaults to the compact projection; an explicit format request from the caller always wins.
- **FR-011**: When `KAITEN_DEFAULT_COLUMN_ID` / `KAITEN_DEFAULT_LANE_ID` are set, card creation without an explicit column/lane MUST use them; explicit arguments win; with neither configured nor passed, the error message MUST mention both remedies.
- **FR-012**: When `KAITEN_HTTP_TIMEOUT_MS` is set, every HTTP request MUST fail with a self-describing timeout error if it exceeds the limit. When `KAITEN_HTTP_RETRIES=N` is set, transiently failed **read** requests MUST be retried up to N times; state-changing requests MUST never be auto-retried. Unset variables preserve current behavior exactly.
- **FR-013**: All new variables MUST be optional, parsed from the same configuration sources with the same precedence as existing variables, and documented (including the "guardrails are not token permissions" caveat and agent-facing guidance not to set/unset guardrail variables themselves).
- **FR-014**: With none of the new variables set, all existing tool contracts (names, schemas, parameter required-ness, defaults, response shapes, tool order) MUST remain observably unchanged, except the allowlist gap closures of FR-001..003.
- **FR-015**: Every rejection error MUST be self-describing: name the variable that caused it and state what the agent should relay to the user.

### Key Entities

- **Guardrail configuration**: the set of optional environment variables above; loaded from the existing four config sources with existing precedence rules.
- **Scope**: the effective set of spaces/boards/columns/lanes the agent may see and touch — the intersection of all configured guardrails.
- **Protected column**: a column that may be read but never targeted by a write.
- **Truncated listing**: a card list capped at the configured limit plus an explicit truncation indication with the total count.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With a board allowlist configured, 100% of cards returned by any listing/search belong to allowed boards (today: 0% guarantee for space-wide listing).
- **SC-002**: With column guardrails configured, zero write operations can land a card in a non-allowed or protected column through any tool.
- **SC-003**: In read-only mode, zero state-changing requests reach Kaiten across the entire tool surface.
- **SC-004**: An operator can confine an agent to a single board with a single variable (`KAITEN_ENFORCE_SCOPE` + existing default), without maintaining id allowlists.
- **SC-005**: With a cards limit of N, no card listing response ever contains more than N cards, and truncation is always explicitly visible to the agent.
- **SC-006**: With no new variables set, the full existing test suite and tool-contract tests pass unchanged (except assertions updated for FR-001..003 gap closure, each with explicit justification).
- **SC-007**: Every guardrail rejection message names the responsible variable — an agent reading the error can explain to the user exactly which setting blocked it.

## Assumptions

- Guardrails protect against agent mistakes and scope creep, **not** against a malicious actor holding the API token; the token's own permissions remain the security boundary. Documentation states this.
- Column/lane filtering of reads happens server-side in this package (the upstream API call may still fetch the full set); the guarantee is about what the *agent* receives, not about network payload size.
- Filtering semantics for reads are "silently narrow" (like the existing space allowlist filter); rejection semantics apply to writes and to direct addressing of out-of-scope entities (like the existing board guard).
- `KAITEN_ENFORCE_SCOPE` composes with allowlists as intersection; setting both is allowed and each check applies independently.
- Making a currently-required creation argument (column) optional-with-configured-default is treated as an additive relaxation: every previously valid call remains valid with identical behavior. The constitution's required-ness freeze is interpreted as forbidding *tightening*; the amendment note ships with this change.
- Retries apply only to idempotent read requests, on transient failures (network errors / 5xx-class), never on client errors; writes are never auto-retried.
- The existing `~/.kaiten/config` → `.env` → `.kaiten.env` → process-env precedence is reused untouched for all new variables.
- CLI and SDK honor the same guardrails automatically because they flow through the same business layer; no CLI/SDK-specific configuration is added in this feature.
