# SQLite journal adapter

Status: **built-in and published** as `@nones/journal/sqlite` (package
`@nones/journal@5.0.0`, workspace `adapters/journal`). Contract, config
resolution, validation, policy and the loader live in
`apps/core/src/journal/`; the database implementation lives in
`adapters/journal/src/sqlite/`.

`@nones/mcp-journal-sqlite` is retired. It remains only as a narrow migration
alias for the exact pre-5.0 default package specifier in journal config.

## Boundaries

| Concern | Owner |
| --- | --- |
| Journal API v1 (`record/query/stats/close`) | `@nones/mcp-core` |
| `~/.config/nones/config.json` journal keys | core config resolver |
| Custom adapter loading (v1 `create(options)`) | core loader |
| Prompt opt-out / read summaries | core policy + read helpers |
| SQLite schema, file permissions, SQL | `@nones/journal/sqlite` |
| Validation, limits, errors, cursors | `@nones/mcp-core/journal` (single copy) |
| CLI and MCP operation capture | core registry/server boundaries |

## Configuration compatibility

The existing top-level object is read unchanged:

```json
{
  "journal": {
    "enabled": true,
    "capturePrompts": false,
    "sqlitePath": "/absolute/or/relative/journal.sqlite",
    "adapter": { "module": "./custom.mjs", "options": {} }
  }
}
```

- `sqlitePath` and `adapter` are mutually exclusive.
- Relative `sqlitePath` resolves against the config directory; `~` expands;
  default is `$XDG_STATE_HOME/nones/journal.sqlite`.
- `adapter.module` may be an absolute path, `./`/`../`, `~/`, `file:` URL, or an
  already installed package name. Bare package names are resolved with
  `import.meta.resolve`; missing packages fail closed. Nothing is downloaded.
- The exact legacy value `"@nones/mcp-journal-sqlite"` is redirected to
  `@nones/journal/sqlite`. No other name falls back to SQLite.
- Discovery order for the config file: `NONES_CONFIG_DIR/config.json`, then
  legacy `OPENCODE_MCP_CONFIG`, then `$XDG_CONFIG_HOME/nones/config.json`.

## Storage

- Table `journal_entries` with `id`, `at`, `at_ms`, `operation`, `outcome`,
  `duration_ms`, `session_id`, `session_title`, `message_id`, `prompt`.
- `application_id = 0x4f4d4a31` ("OMJ1"), `user_version = 1`, WAL mode.
- Unchanged schema: 0.5.0 databases reopen without migration. A newer version,
  foreign database or partial schema fails closed without rewriting bytes.
- New files `0600`, parent `0700` on POSIX; existing modes are never changed.

## Prompt and metadata privacy

Records carry metadata only: ID, UTC time, operation, outcome, duration and
optional native IDs. Tool arguments, results, error bodies and stdout are never
stored. `capturePrompts: false` strips `prompt` inside `PromptPolicyAdapter`
before any adapter (including custom/remote ones) sees the record. Only
`opencode.session.start|send|run` may persist an authorized prompt. List reads
omit prompts unless `includePrompts: true`; stats never contain prompts.
Defaults match 0.5.0 (`enabled: true`, `capturePrompts: true`) when no journal
object is present.

The OpenCode readiness subprocess sets core's explicit
`NONES_MCP_JOURNAL_SUPPRESS=1`; that private probe never adds a user operation.
Regular CLI actions and MCP tool calls remain instrumented.

## Tests

- Core: legacy config acceptance, installed custom adapter, SQLite round-trip,
  reopen of an existing database, prompt exclusion, disabled journal, MCP and
  CLI boundary recording, readiness-probe suppression.
- Adapter: schema id/version identity, idempotent `record`, reopen/query,
  factory contract.
- OpenCode: imported 0.5.0 journal suite (privacy, invalid config, CLI reads,
  capture) plus the shared journal across aggregate, standalone and
  `server start`.

## Out of scope

- Dual long-running writers: only one process should own a database file.
- Automatic migration of foreign SQLite files.
