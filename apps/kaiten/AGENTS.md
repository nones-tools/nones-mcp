# AGENTS.md — kaiten-mcp for AI agents

MCP server (58 tools) + CLI + typed SDK for the Kaiten API. Package: `@nones/kaiten-mcp`.
Read `specs/000-project/spec.md` for the domain model and `.specify/memory/constitution.md`
for the non-negotiable rules before making structural changes.

## Commands

```bash
bun install          # deps
bun test             # full suite — no network/credentials needed; must stay green
bunx tsc --noEmit    # strict typecheck; must stay clean
bun run lint         # Biome linter; must stay clean
bun run dev          # MCP server, watch mode
bun run dev:cli      # CLI from sources
bun run build        # bundle to dist/ (Node target) + emit .d.ts
bun run pack         # build + npm tarball (bun pm pack)
bun run release patch|minor|major|X.Y.Z  # version bump + `chore: X.Y.Z` commit + push → CI publishes
```

Releases are CI-driven: only a `chore: X.Y.Z` commit on master triggers
`.github/workflows/release.yml` (lint/test/build → npm publish → GitHub Packages mirror
→ tag + GitHub Release). Regular commits never run CI. Keep upcoming changes under
`## Unreleased` in CHANGELOG.md — the release flow rolls it into the version section.

## Map

| Path | What lives there | Rule |
| --- | --- | --- |
| `src/kaiten/` | **Kaiten Core**: `interfaces/` (entity types), `http/` (fetch client + errors), `api/` (resource classes), `config.ts` | Self-contained: never import from outside `src/kaiten/`. Future standalone package `@nones/kaiten-core` (beads epic `kaiten-mcp-jtg`) |
| `src/services/` | Business logic: `AccessGuard` (space/board allowlists), projections, domain services | Depends only on the core; every class is `@injectable()`, constructor deps via `@inject(TOKENS.X)`, typed against `KaitenApiPort`/`HttpTransport`, never the concrete core classes |
| `src/di/` | Composition root: `tokens.ts` (typed `TOKENS` symbols), `container.ts` (`buildContainer()`, NestJS/Angular-style), barrel | Core classes bound via factory (`toDynamicValue`); app services bound `.to(Class)` |
| `src/sdk.ts` | `KaitenSDK` facade — public API of the package | Adapters call this, never raw HTTP; builds/reads a DI container internally, public constructor signature unchanged |
| `src/interfaces/` | App contracts: `ToolDef`, `CliCommand`, `ToolHook` | Types only |
| `src/mcp/` | MCP adapter: `tools/` by domain, `hooks/` middleware chain, `bootstrap.ts` (`startMcpServer()`), `server.ts` dev entry — published entry is the `kaiten mcp` CLI command | Tool names/schemas are frozen contracts |
| `src/cli/` | CLI adapter: `commands/`, `projections.ts`, `help.ts`, `index.ts` entry | Output format is a frozen contract |
| `src/lib/` | git + temp-dir helpers | |
| `tests/` | bun:test, mocked transport, no network | |
| `docs/` | human documentation (configuration, tools, cli, sdk, architecture, development) | Keep in sync with code |
| `specs/`, `.specify/` | Spec Kit artifacts and workflow | New features: `/speckit-specify` → plan → tasks |

## Hard rules

- **≤ 200 lines per source file.** Split by domain, re-export via the layer's `index.ts`.
- **stdout is the MCP protocol.** Diagnostics → stderr only.
- **Behavior is contract.** Tool names/schemas/defaults, CLI output, root exports —
  don't change them in a refactor; breaking changes (renames, removals, semantics changes)
  need a major version bump. New tools and new optional params are additive and allowed in
  a minor version (see `.specify/memory/constitution.md` Principle IV, amended 1.1.0).
- **Tests gate every change**: `bun test` + `bunx tsc --noEmit` green before done.
- Runtime deps are frozen to `@modelcontextprotocol/sdk` + `zod` + `inversify` +
  `reflect-metadata` (constitution, amended 1.2.0).
- **Import alias `@/*` → `src/*`** (tsconfig paths): use it in `tests/**`. Keep `src/**`
  on relative imports — `tsc` emits declaration files with original specifiers, so `@/` in
  `src` would ship broken `.d.ts` paths to consumers.
- Non-interactive shell flags only (`rm -f`, `cp -f`, `mv -f`, …) — some systems alias
  these to `-i` and an agent will hang on the prompt.

## Configuration the code needs at runtime

`KAITEN_API_URL` and `KAITEN_API_TOKEN` are required; without them `loadConfig()` throws
an actionable error — **relay it to the user verbatim**, it explains where to set the
variables (MCP client `env` block, `./.kaiten.env`, `./.env`, or `~/.kaiten/config`).
Optional: `KAITEN_DEFAULT_SPACE_ID`, `KAITEN_DEFAULT_BOARD_ID`, `KAITEN_ALLOWED_SPACE_IDS`,
`KAITEN_ALLOWED_BOARD_IDS`, `KAITEN_LOG_LEVEL`, `KAITEN_TEMP_DIR`. Details:
`docs/configuration.md`. Tests never need real credentials.
Also optional (guardrails, specs/001-agent-guardrails): `KAITEN_ALLOWED_COLUMN_IDS`,
`KAITEN_ALLOWED_LANE_IDS`, `KAITEN_PROTECTED_COLUMN_IDS`, `KAITEN_ENFORCE_SCOPE`,
`KAITEN_READ_ONLY`, `KAITEN_DISABLED_TOOLS`, `KAITEN_CARDS_LIMIT`, `KAITEN_MINIMAL_DEFAULT`,
`KAITEN_DEFAULT_COLUMN_ID`, `KAITEN_DEFAULT_LANE_ID`, `KAITEN_HTTP_TIMEOUT_MS`,
`KAITEN_HTTP_RETRIES` — see `docs/configuration.md#guardrails`.
All HTTP DELETE calls are disabled unless `KAITEN_API_DELETE_ALLOW=true`, and all writes are
blocked when `KAITEN_READ_ONLY=true` — agents must never set or change these, or any other
guardrail variable, themselves; relay the rejection error (`KaitenDeleteDisabledError`,
`KaitenReadOnlyError`, or a guardrail's own message) to the user verbatim and let them decide.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:970c3bf2 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files
<!-- END BEADS INTEGRATION -->

Also: create a bd issue for any discovered-but-deferred work; close issues in the change
that resolves them and mention the id (e.g. `kaiten-mcp-c9h`) in the commit message.
