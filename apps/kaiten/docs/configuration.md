# Configuration

Settings are merged from the following sources, highest precedence first:

1. Environment variables (`process.env`) — this is what MCP clients' `env` blocks set
2. `KAITEN_CONFIG_FILE` — advanced explicit file override
3. `./.kaiten.env` — per-project settings, safe to commit (IDs only, no secrets)
4. `./.env`
5. `~/.kaiten/config` — global settings, the right place for your token

## One-time MCP initialization

When the URL and token already exist in the current project's `.env` (or in the current
process environment), run:

```bash
npx -y @nones/kaiten-mcp init
```

The command uses the same precedence described below and copies only `KAITEN_API_URL` and
`KAITEN_API_TOKEN` to `~/.kaiten/config`. Existing defaults, guardrails, and comments in
that file are preserved. The file is written atomically with mode `0600`, and the token is
never printed.

After initialization, stdio MCP clients can start the server without an `env`, `cwd`, or
`KAITEN_CONFIG_FILE` entry:

```json
{
  "command": "npx",
  "args": ["-y", "@nones/kaiten-mcp", "mcp"]
}
```

This avoids relying on the MCP host's inherited `PWD`. An explicit `cwd` is still needed
when optional project-local values must be read from `.kaiten.env` or `.env`.

## Configuration precedence

Higher rows override lower rows for each variable independently:

| Priority | Source |
| --- | --- |
| 1 | MCP process environment |
| 2 | `KAITEN_CONFIG_FILE=/absolute/path/to/file` |
| 3 | `<cwd>/.kaiten.env` |
| 4 | `<cwd>/.env` |
| 5 | `~/.kaiten/config` |

`KAITEN_CONFIG_FILE` is an advanced override and must point to a readable file. A missing
or inaccessible path produces a safe `INVALID_CONFIGURATION` diagnostic; its contents are
never logged. Set an explicit MCP `cwd` only when using project files at runtime.

All files use plain `KEY=VALUE` lines; `#` starts a comment.

## Variables

| Variable | Required | Description |
| --- | --- | --- |
| `KAITEN_API_URL` | yes | e.g. `https://your-company.kaiten.ru/api/latest` |
| `KAITEN_API_TOKEN` | yes | Kaiten API token (Profile settings → API tokens) |
| `KAITEN_DEFAULT_SPACE_ID` | no | Space used when `spaceId` is not passed |
| `KAITEN_DEFAULT_BOARD_ID` | no | Board used when `boardId` is not passed; now also scopes space-wide card listing (`kaiten_cards`) when no explicit `boardId` is given |
| `KAITEN_ALLOWED_SPACE_IDS` | no | Comma-separated allowlist; operations outside it are rejected |
| `KAITEN_ALLOWED_BOARD_IDS` | no | Comma-separated allowlist; operations outside it are rejected. Now also filters space-wide card listings (previously leaked cards from every board in the space) |
| `KAITEN_ALLOWED_COLUMN_IDS` | no | Comma-separated allowlist; card lists are filtered to these columns; creating/moving/updating a card into any other column is rejected |
| `KAITEN_ALLOWED_LANE_IDS` | no | Same semantics as above, for lanes |
| `KAITEN_PROTECTED_COLUMN_IDS` | no | Comma-separated write-target ban: create-in/move-to/update-into these columns is rejected. Reading, and operating on cards already there, is allowed |
| `KAITEN_ENFORCE_SCOPE` | no | Set to `true` to turn `KAITEN_DEFAULT_SPACE_ID`/`KAITEN_DEFAULT_BOARD_ID` into hard boundaries — explicit ids that differ are rejected. Inert (with a stderr warning) if neither default is set |
| `KAITEN_READ_ONLY` | no | Set to `true` to block every POST/PATCH/PUT/DELETE at the HTTP client, before any request is sent. Overrides `KAITEN_API_DELETE_ALLOW` |
| `KAITEN_DISABLED_TOOLS` | no | Comma-separated MCP tool names to exclude from registration (absent from `tools/list`). Unknown names are ignored with a stderr warning |
| `KAITEN_CARDS_LIMIT` | no | Positive integer; caps how many cards `kaiten_cards` / `kaiten_find_cards` return, wrapping truncated results in `{ truncated, total, returned, note, cards }` |
| `KAITEN_MINIMAL_DEFAULT` | no | Set to `true` to make `kaiten_cards` default to the minimal projection; explicit `minimal: false` still returns the full payload |
| `KAITEN_DEFAULT_COLUMN_ID` | no | Column used by card creation when `columnId` is omitted. Explicit argument wins; neither configured nor passed → actionable error |
| `KAITEN_DEFAULT_LANE_ID` | no | Lane used by card creation when `laneId` is omitted. Explicit argument wins |
| `KAITEN_HTTP_TIMEOUT_MS` | no | Positive integer; each HTTP request aborts after this many ms with `KaitenTimeoutError`. Unset → no timeout (today's behavior) |
| `KAITEN_HTTP_RETRIES` | no | Non-negative integer; **GET requests only** are retried up to this many times on network errors or HTTP ≥ 500. Writes are never retried. Unset/`0` → no retries (today's behavior) |
| `KAITEN_LOG_LEVEL` | no | `error` \| `warn` \| `info` (default) \| `debug` — logs go to stderr |
| `KAITEN_TEMP_DIR` | no | Directory for downloaded card files (default `/tmp/kaiten`) |
| `KAITEN_API_DELETE_ALLOW` | no | Set to `true` to enable DELETE tools (default disabled — see [Destructive operations](../README.md#destructive-operations)) |

## Examples

Global credentials in `~/.kaiten/config`:

```ini
KAITEN_API_URL=https://your-company.kaiten.ru/api/latest
KAITEN_API_TOKEN=your_token
```

Per-project defaults in `./.kaiten.env` (committable — contains no secrets):

```ini
KAITEN_DEFAULT_SPACE_ID=12345
KAITEN_DEFAULT_BOARD_ID=67890
```

## Allowlists

When `KAITEN_ALLOWED_SPACE_IDS` / `KAITEN_ALLOWED_BOARD_IDS` are set, every operation is
validated against them: listing spaces filters to allowed ones, and card operations check
the card's board. Useful to keep an AI agent scoped to one project's boards.

## Guardrails

`specs/001-agent-guardrails` adds a set of operator-configured limits — allowlists,
read-only mode, hard scope, tool trimming, response-size caps and network policy — on top
of the space/board allowlists above. They apply in three enforcement tiers:

- **HTTP-client gate** (`src/kaiten/http/client.ts`) — `KAITEN_READ_ONLY` and
  `KAITEN_API_DELETE_ALLOW`. Enforced before any network request is made; nothing in the
  API layer or above can bypass it.
- **Service guard** (`src/services/guard.ts`, `src/services/card.service.ts`) —
  `KAITEN_ALLOWED_SPACE_IDS` / `KAITEN_ALLOWED_BOARD_IDS` / `KAITEN_ALLOWED_COLUMN_IDS` /
  `KAITEN_ALLOWED_LANE_IDS` / `KAITEN_PROTECTED_COLUMN_IDS` / `KAITEN_ENFORCE_SCOPE` /
  `KAITEN_DEFAULT_COLUMN_ID` / `KAITEN_DEFAULT_LANE_ID`. Enforced in business logic, so the
  CLI and SDK get the same protection as the MCP tools.
- **MCP adapter** (`src/mcp/bootstrap.ts`, `src/mcp/tools/`) — `KAITEN_DISABLED_TOOLS`,
  `KAITEN_CARDS_LIMIT`, `KAITEN_MINIMAL_DEFAULT`. Shapes the tool surface and response size
  for MCP clients only; the SDK/CLI are unaffected.

**Composition is intersection**: when several guardrails are configured, an operation must
satisfy every one of them — the most restrictive combination always wins. For example, a
board allowlist and `KAITEN_ENFORCE_SCOPE` set together both apply; a card must pass both
checks.

**Guardrails constrain the agent, they are NOT a substitute for Kaiten API-token
permissions.** They are a cooperative limit on what this MCP server will attempt on the
agent's behalf — anyone with direct access to the same Kaiten API token can still do
anything the token itself is permitted to do. Use Kaiten's own permission model for
security boundaries that must hold regardless of which client is talking to the API.

Every rejection error names the exact variable responsible. As with `KAITEN_API_DELETE_ALLOW`
below: **AI agents must never set or change any guardrail variable themselves** — these are
operator decisions. When a guardrail rejects an operation, relay the error message to the
user verbatim and let them decide whether to adjust the variable.

### Gap fixes in this release

Two pre-existing variables previously didn't do everything their names promised; this
release closes the gap so their documented behavior matches reality:

- `KAITEN_ALLOWED_BOARD_IDS` now also filters space-wide card listings (`kaiten_cards` with
  no `boardId`, `kaiten_find_cards`, tag-based listings) — previously these leaked cards
  from every board in the space regardless of the allowlist.
- `KAITEN_DEFAULT_BOARD_ID` now scopes card listing when no explicit `boardId` is passed —
  previously it was ignored by `kaiten_cards`.

Both changes only affect operators who already set these variables.

## Destructive operations (DELETE gate)

Every HTTP DELETE call to the Kaiten API (`kaiten_delete_card`, `kaiten_delete_checklist`,
`kaiten_delete_checklist_item`, `kaiten_delete_comment`, `kaiten_remove_tag`,
`kaiten_detach_from_parent`) is disabled by default. Calling one throws an actionable error
unless `KAITEN_API_DELETE_ALLOW` is set to exactly `true` (case-insensitive) — any other value,
including unset, keeps DELETE disabled. This is enforced at the HTTP client layer, so it cannot
be bypassed by any tool, service, or SDK method. See the README's
[Destructive operations](../README.md#destructive-operations) section for how to enable it.
`kaiten_clean_temp` is unaffected — it only deletes local temp files, never Kaiten data.

## Missing configuration

Without `KAITEN_API_URL` / `KAITEN_API_TOKEN` the server starts (so `tools/list` works),
but every tool call returns an actionable error explaining which variables to set and
where. AI agents are expected to relay that error to the user verbatim.
