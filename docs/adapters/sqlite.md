# SQLite journal adapter

Status: **implemented and extracted** (`@nones/mcp-journal-sqlite@0.1.0`).
Contract, config resolution, validation, policy and the loader live in
`apps/core/src/journal/`; the database implementation lives in
`adapters/sqlite`. OpenCode 0.5.0 source keeps operation naming and CLI capture.

## Boundaries

| Concern | Owner |
| --- | --- |
| Journal API v1 (`record/query/stats/close`) | `@nones/mcp-core` |
| `~/.config/nones/config.json` journal keys | core config resolver |
| Custom adapter loading (v1 `create(options)`) | core loader |
| Prompt opt-out / read summaries | core policy + read helpers |
| SQLite schema, file permissions, SQL | `@nones/mcp-journal-sqlite` |
| Validation, limits, errors, cursors | `@nones/mcp-core/journal` (single copy) |
| `opencode.session.*` / service capture | `apps/opencode` CLI |

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
- Discovery order for the config file: `NONES_CONFIG_DIR/config.json`, then
  legacy `OPENCODE_MCP_CONFIG`, then `$XDG_CONFIG_HOME/nones/config.json`.

## Storage

- Table `journal_entries` with `id`, `at`, `at_ms`, `operation`, `outcome`,
  `duration_ms`, `session_id`, `session_title`, `message_id`, `prompt`.
- `application_id = 0x4f4d4a31` ("OMJ1"), `user_version = 1`, WAL mode.
- Unchanged schema: 0.5.0 databases reopen without migration. A newer version,
  foreign database or partial schema fails closed without rewriting bytes.
- New files `0600`, parent `0700` on POSIX; existing modes are never changed.

## Prompt handling

`capturePrompts: false` strips `prompt` inside `PromptPolicyAdapter` before any
adapter (including custom/remote ones) sees the record. List reads omit prompts
unless `includePrompts: true`; stats never contain prompts. Defaults match 0.5.0
(`enabled: true`, `capturePrompts: true`) when no journal object is present.

## Tests

- Core: legacy config acceptance, installed custom adapter, SQLite round-trip,
  reopen of an existing database, prompt exclusion, disabled journal.
- Adapter: schema id/version identity, idempotent `record`, reopen/query,
  factory contract.
- OpenCode: imported 0.5.0 journal suite (privacy, invalid config, CLI reads,
  capture) still passes through the re-exported API.

## Out of scope

- Recording aggregate MCP tool calls (journaling remains CLI-driven).
- Dual writers: only one process should own a database file.
- Automatic migration of foreign SQLite files.
