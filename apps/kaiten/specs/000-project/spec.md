# Project Specification: kaiten-mcp

**Status**: living document | **Created**: 2026-07-20 | **Package**: `@nones/kaiten-mcp`

## Purpose & Direction

`@nones/kaiten-mcp` connects AI agents to [Kaiten](https://kaiten.ru) (a kanban-style
project-management platform popular in the Russian market). It ships three surfaces
over one core:

1. **MCP server** (`kaiten-mcp` bin) — 58 tools over stdio for Claude Code, Claude
   Desktop, Cursor and any MCP client. This is the primary product.
2. **CLI** (`kaiten` bin) — human/scriptable access to the same operations.
3. **Typed SDK** (package root import) — programmatic access for Node/Bun code.

Direction: the product is an *agent workflow bridge* — an AI agent reads a Kaiten card,
creates a git branch for it, implements, comments and moves the card. Token-optimized
responses (`minimal`/`simple` projections) are a core feature, not sugar.

## Business Entities (Kaiten domain)

| Entity | Key fields used | Notes |
| --- | --- | --- |
| **Space** | `id`, `title` | Top-level container; `KAITEN_DEFAULT_SPACE_ID`, allowlist filter |
| **Board** | `id`, `title`, space ref | Lives in a space; allowlist filter |
| **Column** | `id`, `title`, `board_id` | Card position; move validates column ∈ card's board |
| **Lane** | `id` | Horizontal swimlane; optional on create/move, defaults are board-specific |
| **Card** | `id`, `title`, `description`, `board_id`, `column_id`, `lane_id`, `condition` (1 active / 2 archived / 3 done), `tags`, `members`, `parents_count`, `children_count`, `planned_start/end`, `size` | Central entity; all tool groups hang off it |
| **Card hierarchy** | `parent_link_ids`, `parents`, children endpoint | Parent/child links, recursive traversal (`all=true`) |
| **Tag** | `id`, `name`, `color` | Add by name; removal resolves id from the card first |
| **Checklist / ChecklistItem** | `id`, `name`, `text`, `checked` | Checklists под `/cards/{id}/checklists`, items под `/checklists/{id}/items` |
| **Comment** | `id`, `text`, `parent_id` | Threaded via parent_id |
| **CardFile** | `id`, `name` | Downloaded to `KAITEN_TEMP_DIR` (default `/tmp/kaiten/{cardId}/`) |
| **User** | `id`, `full_name` | Assignment via `members` PATCH; search by query |

Adjacent (non-Kaiten) domain: **git helpers** — branch naming
`feature/{cardId}-{slugified-title}`, commit messages `[{cardId}] {message}`.

## Architecture

```
src/kaiten/      Kaiten Core: interfaces/, http/ (fetch adapter), api/ (resources), config
src/services/    business logic: AccessGuard (allowlists), projections, domain services
src/sdk.ts       KaitenSDK — facade over services; the only API adapters may use
src/interfaces/  app-level contracts: ToolDef, CliCommand, ToolHook
src/mcp/         MCP adapter: tools/ (by domain), hooks/ (logging → error chain), server
src/cli/         CLI adapter: commands/ registry, projections, help
src/lib/         infra: git, temp dirs
```

Key decisions (ADR-style):
- **D1. Zero-framework HTTP**: native `fetch` behind a `KaitenClient` adapter with an
  injectable transport — no axios, tests mock the transport, published package keeps
  runtime deps to `@modelcontextprotocol/sdk` + `zod`.
- **D2. Bun toolchain, Node runtime**: built/tested with Bun, published bundle runs on
  plain Node >= 18 (`--target node --packages external`).
- **D3. Config precedence**: `process.env` > `KAITEN_CONFIG_FILE` >
  `./.kaiten.env` > `./.env` > `~/.kaiten/config`; missing required vars produce an
  error explicitly designed to be relayed by an AI agent to its human.
- **D4. Kaiten Core extraction (standing, not yet executed)**: `src/kaiten/` will move to
  a standalone `@nones/kaiten-core` package; this repo keeps the MCP/CLI/SDK layers and
  takes the core as a dependency. Until then the core stays import-isolated. Beads epic:
  `kaiten-mcp-jtg`.
- **D5. Contract freeze**: tool names/schemas, CLI output and root exports are contracts
  (constitution, Principle IV); breaking them requires a major version bump.
- **D6. PWD-independent MCP credentials**: `kaiten init` reads credentials through D3
  from the user's current shell/project and persists only the API URL and token in
  `~/.kaiten/config` with restrictive permissions. Normal stdio MCP startup therefore
  requires neither an inherited project `PWD` nor a custom credential-file path.

## Out of Scope (current)

- Kaiten webhooks / real-time updates (pull-only).
- Custom fields, time-tracking write operations, sprints/retro modules.
- Localization of CLI output (currently Russian, tracked as beads `kaiten-mcp-2f1`).
