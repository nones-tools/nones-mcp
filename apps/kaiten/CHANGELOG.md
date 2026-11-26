# Changelog

All notable changes to `@nones/kaiten-mcp` are documented here. Versioning follows
[SemVer](https://semver.org/): breaking MCP tool contract changes (renames, removals,
required-ness/type changes) bump the major version; new tools and new optional params are
additive and ship in a minor version (constitution Principle IV, amended 1.1.0).

## 4.3.0 — 2026-07-27

### Added

- `kaiten init` imports the API URL and token from the normal environment/`.env`
  precedence and stores them securely in `~/.kaiten/config`. This makes the recommended
  `npx -y @nones/kaiten-mcp mcp` setup independent of an MCP host's `PWD`, without shell
  wrappers or custom credential paths.

## 4.2.1 — 2026-07-27

### Fixed

- MCP tools now advertise `execution.taskSupport: "optional"` through the SDK's
  low-level server API. Codex Desktop can therefore add all Kaiten tools to task-chat
  context; restart the MCP client and open a new chat after updating.

## 4.2.0 — 2026-07-27

### Added

- `kaiten_health`: local read-only diagnostics for stdio MCP installations. It reports
  server version, cwd, safe credential presence/provenance, normalized API origin and
  readiness without contacting Kaiten or exposing secrets.
- `KAITEN_CONFIG_FILE` for an explicit, absolute configuration-file path. Per-variable
  precedence is process environment, explicit file, `<cwd>/.kaiten.env`, `<cwd>/.env`,
  then `~/.kaiten/config`.
- `kaiten_find_cards_by_tag`, an accurately named additive alias for the preserved
  tag-only `kaiten_find_cards` behavior.

### Changed

- MCP startup keeps SDK/API initialization lazy, so handshake and tool discovery work
  without credentials or network access.
- MCP failures now use stable codes for missing/invalid configuration, timeouts and API
  failures; diagnostics redact bearer tokens and query secrets and never include API bodies.

## 4.1.0 — 2026-07-22

Card listings became usable on large boards (kaiten-mcp-3mh): sensible defaults
(active cards, newest first) and automatic pagination past the server's 100-card page cap.

### Changed

- **`kaiten_cards` / `KaitenSDK.getCards` / `kaiten cards` list defaults** are now
  `condition: 1` (on-board cards only), sorted `updated` `desc` (newest first). Previously
  the server's own defaults applied — all conditions, oldest first — so on large boards the
  first 100 cards were exclusively ancient archived ones and active work was unreachable.
  Old behavior remains addressable: `condition: 'all'` plus `orderBy: 'id'`,
  `orderDirection: 'asc'`. Tag/find listings (`kaiten_find_cards`, `getCardsWithTag`) go
  through the same path and now also search active cards, newest first.
  *Versioning note*: formally a default change (constitution IV would call for a major);
  shipped in a minor by explicit maintainer decision — the previous defaults were
  server-incidental, undocumented, and unusable in practice.

### Added

- New optional `kaiten_cards` params, mapped onto the documented `GET /cards` query
  (developers.kaiten.ru/cards/retrieve-card-list): `condition` (`1` | `2` | `'all'`),
  `limit` (1–1000, default 100), `offset`, `orderBy`, `orderDirection` (`'asc'`/`'desc'`).
  Same options object on `KaitenSDK.getCards(spaceId, boardId, minimal, options)` —
  additive 4th parameter — and on `CardsApi.getCards`. New root export: `CardListOptions`.
- **Auto-pagination**: a `limit` above the server's per-request cap of 100 is fetched in
  sequential pages of 100, stopping early on a short page and hard-capped at 10 pages
  (1000 cards) to stay friendly with Kaiten's rate limiting.

## 4.0.1 — 2026-07-22

### Fixed

- `kaiten_cards` (and `KaitenSDK.getCards` / `kaiten cards`) now calls the documented
  card-list endpoint `GET /cards?space_id=...[&board_id=...]` instead of the undocumented
  `/spaces/{id}/cards` path. On some Kaiten installations (observed on an on-premise
  2026 build) the old path was served as the unfiltered company-wide `/cards` list, so
  space scoping — both `KAITEN_DEFAULT_SPACE_ID` and an explicit `spaceId` — was silently
  ignored and the first 100 cards of the whole company came back (kaiten-mcp-zl8).
  Board-scoped listings were unaffected, which is why the bug went unnoticed: the
  `board_id` query param filters correctly on either path. Not a 4.0.0 regression — the
  URL dated back to the 3.0.0 TypeScript rewrite.

## 4.0.0 — 2026-07-22

Single-binary package: the MCP server starts via the `kaiten mcp` CLI subcommand and the
separate `kaiten-mcp` binary is removed. **Breaking** — ships as 4.0.0.

### Breaking

- The `kaiten-mcp` bin is removed from the package; `kaiten` is the only binary. Any MCP
  client config that launched the server as `npx -y @nones/kaiten-mcp` (npx resolved that
  to the now-removed `kaiten-mcp` bin) or as a global `kaiten-mcp` will now start the bare
  CLI and fail with `Unknown command` — append the `mcp` argument.

### Added

- `kaiten mcp` CLI command — starts the stdio MCP server in-process. Same server as
  before: the bootstrap moved verbatim from `src/mcp/server.ts` into a shared
  `startMcpServer()` (`src/mcp/bootstrap.ts`); tool names, schemas and behavior are
  unchanged. The MCP adapter is imported lazily, so every other CLI command starts as
  fast as before.

### Migration

For humans and AI agents updating an installation:

1. In MCP client configs (`claude_desktop_config.json`, `.cursor/mcp.json`,
   `claude mcp add`, …) replace `npx -y @nones/kaiten-mcp` with
   `npx -y @nones/kaiten-mcp mcp` — i.e. `"args": ["-y", "@nones/kaiten-mcp", "mcp"]`.
2. Replace direct `kaiten-mcp` invocations (global installs, shell wrappers, systemd
   units) with `kaiten mcp`.
3. Nothing else changes: env variables, tool names/schemas, CLI output and root exports
   are all identical to 3.3.0.

## 3.3.0 — 2026-07-21

Agent guardrails & server modes (`specs/001-agent-guardrails`) — 12 new optional
environment variables, all off by default; unset behavior is unchanged. No breaking
changes.

### Added

- **Scope**: `KAITEN_ALLOWED_COLUMN_IDS` / `KAITEN_ALLOWED_LANE_IDS` filter card listings
  and reject writes targeting a disallowed column/lane; `KAITEN_PROTECTED_COLUMN_IDS` bans
  write-targeting specific columns while leaving reads and existing cards there untouched;
  `KAITEN_ENFORCE_SCOPE` turns `KAITEN_DEFAULT_SPACE_ID`/`KAITEN_DEFAULT_BOARD_ID` into hard
  boundaries that reject any explicit id outside them.
- **Modes**: `KAITEN_READ_ONLY` blocks every POST/PATCH/PUT/DELETE at the HTTP client with
  `KaitenReadOnlyError`, overriding `KAITEN_API_DELETE_ALLOW`; `KAITEN_DISABLED_TOOLS` hides
  named tools from MCP registration; `KAITEN_CARDS_LIMIT` caps `kaiten_cards` /
  `kaiten_find_cards` to N results, wrapping truncated responses in
  `{ truncated, total, returned, note, cards }`; `KAITEN_MINIMAL_DEFAULT` makes
  `kaiten_cards` default to the minimal projection (explicit `minimal` still wins).
- **Defaults & network**: `KAITEN_DEFAULT_COLUMN_ID` / `KAITEN_DEFAULT_LANE_ID` supply the
  column/lane for card creation when omitted (explicit argument wins; error naming both
  remedies when neither is available); `KAITEN_HTTP_TIMEOUT_MS` aborts a slow request with
  `KaitenTimeoutError`; `KAITEN_HTTP_RETRIES` retries GET requests only, on network errors
  or HTTP >= 500 (writes are never retried).
- New root exports: `loadConfigLenient()` (same merge/parse as `loadConfig`, never throws
  on missing credentials), `KaitenReadOnlyError`, `KaitenTimeoutError`. `KaitenClientOptions`
  gains optional `readOnly`, `timeoutMs`, `retries`.
- `kaiten_create_card`'s `columnId` is now optional (falls back to
  `KAITEN_DEFAULT_COLUMN_ID`) — an additive relaxation per constitution 1.3.0; every
  previously valid call behaves identically.

### Fixed

- `KAITEN_ALLOWED_BOARD_IDS` now also filters space-wide card listings (`kaiten_cards` with
  no `boardId`, `kaiten_find_cards`, tag-based listings) — previously these leaked cards
  from every board in the space regardless of the allowlist.
- `KAITEN_DEFAULT_BOARD_ID` now scopes `kaiten_cards` to that board when no explicit
  `boardId` is passed — previously it was ignored by card listing.

## 3.2.3 — 2026-07-20

_No changelog entries — see commit history._

## 3.2.2 — 2026-07-20

### Added

- CI/CD via GitHub Actions (`.github/workflows/release.yml`): triggered only by a
  `chore: X.Y.Z` release commit on `master` (regular commits never run CI). Pipeline:
  Biome lint -> typecheck -> tests -> build -> Node smoke-test -> `npm publish`
  (`@nones/kaiten-mcp`) -> GitHub Packages mirror (`@zeizel/kaiten-mcp`) -> git tag +
  GitHub Release with notes from this changelog.
- `bun run release patch|minor|major|X.Y.Z` script: local gates, version bump,
  changelog roll, `chore: X.Y.Z` commit and push.
- Biome linter (`bun run lint`), zero diagnostics across src/tests/scripts.

## 3.2.1 — 2026-07-20

### Added

- **Dependency injection composition root** (`src/di/`), NestJS/Angular-style, built on
  `inversify`. `TOKENS` (typed `Symbol`s) and `buildContainer(overrides?)` are now
  exported from the package root, alongside `KaitenApiPort` and the per-resource port
  types (`CardsApiPort`, `BoardsApiPort`, …) from `src/kaiten/interfaces/ports.ts`.
- Every class in `src/services/` is now `@injectable()` with constructor dependencies
  resolved via `@inject(TOKENS.X)`, and depends on `KaitenApiPort`/`HttpTransport`
  instead of the concrete `KaitenApi`/`KaitenClient` classes. `KaitenApi implements
  KaitenApiPort`.
- New runtime dependencies: `inversify` and `reflect-metadata` (constitution amended to
  1.2.0). `src/kaiten/` (Kaiten Core) stays undecorated and framework-free — nothing
  under it imports `inversify`; `KaitenClient`/`KaitenApi` are bound in the container via
  factory bindings (`toDynamicValue`).

- TypeScript path alias `@/*` → `src/*` (tsconfig `paths`); test suite imports through it.

### Changed

- Relative imports lost their `.js` extensions; cross-directory imports go through
  directory barrels; `node:` import prefixes replaced with bare specifiers (identical
  behavior on Node and Bun).
- README: manual MCP connection recipe (token read from a local `.env` via `sh -c`),
  Kaiten URLs generalized to `https://<kaiten_url>/api/latest`.

No breaking changes: `new KaitenSDK(options)` / `createSDK(options)` keep their exact
pre-DI constructor signature and behavior (they build a container internally), and every
existing root export is unchanged.

## 3.2.0 — 2026-07-20

New Kaiten API coverage, researched against the official docs (https://developers.kaiten.ru/).
No breaking changes — the 45 tools from 3.1.0 keep their exact names, parameters, order and
defaults.

### Added

- **`KAITEN_API_DELETE_ALLOW` gate is now applied to every DELETE-backed tool**, including the
  two new ones below (`kaiten_unblock_card`, `kaiten_remove_external_link`) - all HTTP DELETE
  calls go through `KaitenClient.delete()`, the single enforcement point, so nothing can bypass
  it.
- **Time logs** (`GET`/`POST /cards/{card_id}/time-logs`):
  - `kaiten_get_time_logs` (`cardId`)
  - `kaiten_add_time_log` (`cardId`, `timeSpent` in minutes, `forDate` `YYYY-MM-DD`, `roleId`,
    `comment?`)
- **Card blockers** (`/cards/{card_id}/blockers`):
  - `kaiten_get_blockers` (`cardId`)
  - `kaiten_block_card` (`cardId`, `reason?`, `blockerCardId?`)
  - `kaiten_unblock_card` (`cardId`, `blockerId`) - destructive, requires
    `KAITEN_API_DELETE_ALLOW=true`
- **External links** (`/cards/{card_id}/external-links`) - useful for attaching PR/issue URLs
  to a card:
  - `kaiten_get_external_links` (`cardId`)
  - `kaiten_add_external_link` (`cardId`, `url`, `description?`)
  - `kaiten_remove_external_link` (`cardId`, `linkId`) - destructive, requires
    `KAITEN_API_DELETE_ALLOW=true`
- **Company dictionaries** (read-only, no space/board/card scoping):
  - `kaiten_tags` (`query?`, `spaceId?`) - `GET /tags`
  - `kaiten_card_types` - `GET /card-types`
  - `kaiten_custom_properties` - `GET /company/custom-properties`; values are set on cards via
    `kaiten_update_card`'s legacy `data` with `{"properties": {"id_<propertyId>": value}}`
- **`kaiten_current_user`** - `GET /users/current`, exposing the SDK's pre-existing
  `getCurrentUser()`.
- **`kaiten_attach_file`** (`cardId`, `filePath`, `fileName?`) - reads a local file and uploads
  it to a card via `PUT /cards/{card_id}/files` as `multipart/form-data` (part name `file`).
  Backed by a new `KaitenClient.putForm()` that lets `fetch` set the multipart boundary itself
  (no manual `Content-Type`).
- **`typeId` on `kaiten_create_card`** - optional card type id (`type_id` in the request body),
  discoverable via `kaiten_card_types`.

### Changed

- Tool registry grew from 45 to 58 tools. The 45 from 3.1.0 keep their exact order; the 13 new
  tools (`kaiten_current_user`, `kaiten_tags`, `kaiten_card_types`, `kaiten_custom_properties`,
  `kaiten_get_time_logs`, `kaiten_add_time_log`, `kaiten_get_blockers`, `kaiten_block_card`,
  `kaiten_unblock_card`, `kaiten_get_external_links`, `kaiten_add_external_link`,
  `kaiten_remove_external_link`, `kaiten_attach_file`) are appended at the end of the registry,
  never interleaved with the existing sequence.

## 3.1.0 — 2026-07-20

AI-agent ergonomics pass on the MCP tool API. No breaking changes — the 39 tools from 3.0.0
keep their exact names, parameters, order and defaults.

### Added

- **Structured fields on `kaiten_update_card`.** In addition to the legacy `data` JSON
  string, the tool now accepts `title`, `description`, `columnId`, `laneId`, `boardId`,
  `size`, `plannedStart`, `plannedEnd`, `dueDate`, `asap` and `condition` directly. `data`
  is now optional and marked deprecated; explicit structured fields win over the same key
  inside `data` when both are given. At least one field must be supplied.
- **`tags`, `size`, `plannedStart`, `plannedEnd` on `kaiten_create_card`** — the SDK already
  accepted them; the tool now exposes them too.
- **`kaiten_lanes`** — list the lanes of a board, so agents can discover `laneId` values for
  `kaiten_create_card` / `kaiten_move_card` instead of having to read them off an existing
  card. Backed by a new `BoardsApi.getLanes()` (`GET /boards/{boardId}/lanes`) and a new
  `Lane` entity type.
- Five new tools closing pre-existing gaps between the SDK and the MCP surface (the SDK
  methods already existed; they had no tool wrapper before):
  - `kaiten_update_comment` (`commentId`, `text`)
  - `kaiten_delete_comment` (`commentId`)
  - `kaiten_archive_card` (`cardId`)
  - `kaiten_unarchive_card` (`cardId`)
  - `kaiten_unassign_card` (`cardId`, `userId`)
- **MCP tool annotations** (`readOnlyHint`, `destructiveHint`) on every tool definition,
  passed through to the MCP SDK's `registerTool`, so clients can render/gate calls
  appropriately (e.g. skip confirmation UI for read-only tools, warn before destructive
  ones).
- Server version is now read from `package.json` at runtime instead of being hardcoded, so
  `serverInfo.version` in the MCP handshake can never drift from the published version.

### Changed

- `kaiten_create_card` / `kaiten_move_card` descriptions now point agents at `kaiten_lanes`
  to discover `laneId` values (previously suggested reading it off an existing card via
  `kaiten_card`).
- Tool registry grew from 39 to 45 tools. The original 39 keep their exact order; the 6 new
  tools (`kaiten_lanes`, `kaiten_update_comment`, `kaiten_delete_comment`,
  `kaiten_archive_card`, `kaiten_unarchive_card`, `kaiten_unassign_card`) are appended at
  the end of the registry, never interleaved with the existing sequence.
- Constitution Principle IV amended (1.0.0 → 1.1.0) to explicitly allow additive MCP tool
  contract changes (new tools, new optional params) in minor versions, while still
  requiring a major bump for renames, removals or semantics changes.

## 3.0.0 — 2026-07-20

Full TypeScript rewrite of the project (previously a hand-rolled JS server). No intentional
behavior change versus the pre-rewrite server — this release freezes that behavior as the
tested contract going forward.

### Added

- Layered TypeScript architecture: `src/kaiten` (self-contained Kaiten Core: entities, HTTP
  client, API resource classes, config loading), `src/services` (business logic — access
  guard, projections, domain services), `src/sdk.ts` (`KaitenSDK` facade, the package's
  public API), `src/mcp` (MCP adapter: tools by domain + a hook middleware chain), `src/cli`
  (CLI adapter: commands, projections, help).
- MCP server rebuilt on the official `@modelcontextprotocol/sdk`, registering all 39 tools
  from the original hand-rolled server, verified to match it exactly (names, schemas,
  required params, defaults, order).
- Bun as the toolchain: `bun test` (204 tests, no network/credentials required) and
  `bunx tsc --noEmit` gate every change; `bun run build` bundles to `dist/` for Node >= 18.
- Spec Kit artifacts (`specs/`, `.specify/`) and a project constitution
  (`.specify/memory/constitution.md`) formalizing the AI-first, layered, behavior-preserving
  rules the codebase already followed informally.
- Human documentation under `docs/` (configuration, tools, CLI, SDK, architecture,
  development) plus `AGENTS.md` as the map for AI coding agents.
- Package renamed to `@nones/kaiten-mcp`.

### Changed

- `laneId` support in `kaiten_create_card` / `kaiten_move_card`, and a fixed `minimal` flag
  behavior in card tools (carried over from the pre-rewrite server's last patch release).
