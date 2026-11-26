# Implementation Plan: Agent Guardrails & Server Modes (v3.4.0)

**Branch**: `001-agent-guardrails` | **Date**: 2026-07-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-agent-guardrails/spec.md`

## Summary

Add ten opt-in environment-variable guardrails: allowlist gap closure (board filtering
in listings), column/lane allowlists, protected columns, hard scope enforcement,
global read-only gate, tool hiding, cards limit with truncation indicator,
minimal-by-default projections, creation defaults for column/lane, and HTTP
timeout/retries. Approach: extend `KaitenConfig`/`loadConfig` with optional fields;
enforce scope rules in `AccessGuard` + `CardService` (services layer); enforce
read-only/timeout/retries in `KaitenClient` (core HTTP layer, same pattern as the
existing DELETE gate); tool hiding and cards-limit/minimal-default at the MCP adapter
layer. All changes additive; with no new variables set, observable behavior is
unchanged except documented allowlist gap closures.

## Technical Context

**Language/Version**: TypeScript 5 (strict), Node >= 18 runtime, Bun toolchain

**Primary Dependencies**: `@modelcontextprotocol/sdk`, `zod`, `inversify`, `reflect-metadata` (frozen set — no additions; timeout uses native `AbortController`)

**Storage**: N/A (env vars + existing `KEY=VALUE` config files)

**Testing**: `bun:test`, mocked `HttpTransport` / injected `fetchImpl`, no network

**Target Platform**: MCP server over stdio + CLI + SDK library (same package)

**Project Type**: library + CLI + MCP server (single package)

**Performance Goals**: no extra Kaiten API calls on the hot path beyond what guards already make (card lookup reuse); read filtering is in-memory

**Constraints**: ≤200 lines/source file; layered architecture (adapter → SDK facade → services → core); `src/kaiten/` self-contained; MCP tool contract additive-only; stdout = protocol

**Scale/Scope**: ~12 new config fields, ~6 source files touched + ~3 new small files, ~7 new test files; implementation executed by Sonnet subagents from tasks.md

## Constitution Check

*GATE: evaluated against constitution v1.2.0.*

| Principle | Status | Notes |
| --- | --- | --- |
| I. AI-First (≤200 lines, self-describing errors) | PASS (with planned splits) | `client.ts` (149) gains readonly/timeout/retry → extract policy helpers to `src/kaiten/http/policy.ts`; `config.ts` (93) gains parsing → extract parsers to `src/kaiten/config-parse.ts` if needed. Every rejection error names its variable (FR-015). |
| II. Layered architecture | PASS | Guards in services; HTTP gates in core client (wired via container factory options, like `allowDelete`); tool hiding + response shaping in MCP adapter. No adapter reaches past the facade. |
| III. Core isolation | PASS | New core code (`policy.ts`, config fields) imports nothing outside `src/kaiten/`. `KAITEN_DISABLED_TOOLS` is parsed by `loadConfig` (core parses env; the *use* is adapter-side). |
| IV. Behavior contract | PASS with justified exceptions | New optional env vars = additive (minor). Two deliberate deltas: (a) allowlist gap closure FR-001..003 — bug fix on a documented promise, assertions updated with justification; (b) `kaiten_create_card.columnId` required→optional — relaxation, every previously valid call unchanged; constitution amendment note (1.3.0) ships with this change clarifying the freeze forbids *tightening* only. |
| V. Protocol hygiene & token economy | PASS | Warnings → stderr via existing logger. Cards limit + minimal-default are token-economy features per this principle. |
| Frozen runtime deps | PASS | No new dependencies. |

Post-design re-check: PASS (no new violations introduced by Phase 1 design).

## Project Structure

### Documentation (this feature)

```text
specs/001-agent-guardrails/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── env-config.md    # New variable contract
│   └── tool-changes.md  # MCP tool contract deltas
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── kaiten/
│   ├── interfaces/config.ts     # +12 optional fields on KaitenConfig
│   ├── config.ts                # parse new vars; keep <200 lines (extract config-parse.ts if needed)
│   ├── http/
│   │   ├── client.ts            # readOnly gate; timeout+retry via policy.ts
│   │   ├── policy.ts            # NEW: timeout/retry helpers (core-internal)
│   │   └── errors.ts            # +KaitenReadOnlyError, +KaitenTimeoutError
├── services/
│   ├── guard.ts                 # +column/lane/protected/enforce-scope checks (split guard-scope.ts if >200)
│   ├── card.service.ts          # listing filters, default board scoping, create defaults
│   └── projections.ts           # (unchanged; reused for minimal)
├── di/container.ts              # pass new client options (readOnly, timeoutMs, retries)
├── mcp/
│   ├── server.ts                # skip tools named in disabledTools
│   └── tools/
│       ├── cards.ts             # minimal-default + limit-aware handlers; columnId optional
│       └── limit.ts             # NEW: shared truncation helper for card lists
└── sdk.ts                       # createCard signature: columnId now optional (relaxation)

tests/
├── config-guardrails.test.ts    # NEW: parsing, precedence, malformed values
├── http-readonly-gate.test.ts   # NEW
├── http-timeout-retry.test.ts   # NEW
├── services-guard-scope.test.ts # NEW: columns/lanes/protected/enforce-scope
├── services-cards-filter.test.ts# NEW: board/column filtering + default board + create defaults
├── mcp-disabled-tools.test.ts   # NEW
├── mcp-cards-limit.test.ts      # NEW: limit + truncation + minimal-default
└── mcp-tools.test.ts            # UPDATED: frozen-order assertion tolerates none (no order change); createCard schema delta
```

**Structure Decision**: single package, existing layer layout; two new small core
files (`http/policy.ts`), one new MCP helper (`tools/limit.ts`), possible mechanical
splits to respect the 200-line rule.

## Complexity Tracking

No constitution violations requiring justification beyond the two Principle-IV
deltas documented above (gap-closure bug fix; required→optional relaxation with
amendment note).
