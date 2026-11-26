# kaiten-mcp Constitution

## Core Principles

### I. AI-First Codebase
The primary maintainers of this codebase are AI coding agents supervised by a human.
Every structural decision optimizes for agent context efficiency:
- No source file may exceed **200 lines** (`src/**`; tests should follow the same limit).
- One domain concept per file; barrel `index.ts` files define each layer's public surface.
- Errors are self-describing and actionable: a failure message must tell the reader
  (human or AI) what to do next (see the missing-config error in `src/kaiten/config.ts`).
- Project knowledge lives in versioned files (`AGENTS.md`, `docs/`, `specs/`,
  `.specify/memory/`), never only in chat history.

### II. Layered Architecture
Dependencies point inward, never outward:
1. **Interfaces** — pure types and contracts (`src/kaiten/interfaces/`, `src/interfaces/`).
2. **Business logic** — services and the `KaitenSDK` facade (`src/services/`, `src/sdk.ts`).
3. **Integration adapters** — MCP tools and hooks (`src/mcp/`), CLI commands (`src/cli/`),
   infra helpers (`src/lib/`).
An adapter never reaches past the facade into raw HTTP; business logic never imports
adapter code.

### III. Kaiten Core Isolation (future package)
`src/kaiten/` is the Kaiten Core: entity interfaces, HTTP client, API resource classes,
and configuration loading. It MUST stay self-contained — nothing inside `src/kaiten/`
may import from outside it. **Standing decision:** the core will be extracted into a
standalone package `@nones/kaiten-core`; `@nones/kaiten-mcp` will then depend on it.
Tracked as beads epic `kaiten-mcp-jtg`. Until extraction, treat the core's barrel
(`src/kaiten/index.ts`) as a frozen package boundary.

### IV. Behavior-Preserving Changes, Test-Backed
The public surfaces are contracts: MCP tool names/schemas/defaults, CLI commands and
output formats, and the root package exports (`KaitenSDK`, `createSDK`, `KaitenClient`,
`KaitenApi`, `loadConfig`, entity types). Refactors must not change observable behavior.
`bun test` (no network, no real credentials) and `bunx tsc --noEmit` must pass before any
commit; a changed test assertion requires an explicit justification in the commit message.

**Additive vs. breaking, for the MCP tool contract specifically:** a minor version MAY add
new tools or new optional parameters to existing tools, provided every pre-existing tool
keeps its name, its existing parameters' names/types/required-ness, its position relative
to the other pre-existing tools (new tools are appended, never interleaved), and its
observable defaults. Renaming or removing a tool, renaming/removing/changing the type of an
existing parameter, making an optional parameter required, or changing an existing default
requires a major version bump. Tests must encode this distinction explicitly (e.g. a frozen
ordered list for the pre-existing contract, separate assertions for additive tools).

The parameter freeze is directional: it forbids **tightening** an existing parameter
(optional → required, a type change, or removal). **Relaxing** a parameter from required to
optional is additive and allowed in a minor version, provided every previously valid call
behaves identically afterward (the old caller's explicit argument still takes the same
effect; only a new, previously-invalid omission becomes possible).

### V. Protocol Hygiene & Token Economy
stdout belongs to the MCP protocol — all diagnostics go to **stderr**. Tool and CLI
responses offer token-optimized shapes (`minimal`/`simple` flags, short-key projections);
new tools must consider response size a feature requirement, not an afterthought.

## Workflow

- Features follow the Spec Kit flow: `/speckit-specify` → `/speckit-plan` →
  `/speckit-tasks` → `/speckit-implement`; artifacts live under `specs/`.
- Work items are tracked with **beads** (`bd`): check `bd ready` before starting,
  `bd create` for discovered work, close issues in the same change that resolves them.
- Runtime is Node >= 18; Bun is the toolchain (build/test/dev). Runtime dependencies are
  limited to `@modelcontextprotocol/sdk`, `zod`, `inversify` and `reflect-metadata`
  (the latter two power the DI composition root in `src/di/`; `reflect-metadata` is a
  hard runtime requirement of `inversify` 8, not optional) — adding another is an
  architectural decision that requires updating this constitution.

## Governance

This constitution supersedes ad-hoc practices. Amendments are committed together with
the change that motivates them and must keep `AGENTS.md` and `docs/architecture.md`
consistent. Semantic versioning applies to the npm package; breaking any Principle-IV
contract requires a major version bump.

**Version**: 1.3.0 | **Ratified**: 2026-07-20 | **Last Amended**: 2026-07-21

**1.2.0 amendment**: added `inversify` + `reflect-metadata` as frozen runtime
dependencies for the `src/di/` composition root (NestJS/Angular-style DI). `src/kaiten/`
remains undecorated and framework-free — Core classes are bound via factory bindings.

**1.3.0 amendment**: clarified Principle IV's parameter freeze as directional — tightening
(optional→required, type change, removal) requires a major version bump; relaxing
required→optional where every previously valid call behaves identically is additive and
allowed in a minor version. Motivated by `kaiten_create_card`'s `columnId` becoming optional
(falls back to `KAITEN_DEFAULT_COLUMN_ID`) in `specs/001-agent-guardrails` (v3.4.0).
