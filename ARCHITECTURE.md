# Architecture and source migration

Repository: `github.com/nones-tools/nones-mcp`. Status: source migration branch
`task/source-integration`; local changes only, no publishes, no remote writes.

## 1. Layout

| Path | Package | Version | Role |
| --- | --- | --- | --- |
| `apps/core` | `@nones/mcp-core` | 0.1.0 | Single stdio entry `nones-mcp` |
| `apps/kaiten` | `@nones/kaiten-mcp` | 4.3.0 | Imported source + `./module` export |
| `apps/opencode` | `@nones/opencode-mcp` | 0.5.0 | Imported source + `./module` export + journal CLI |
| `adapters/sqlite` | `@nones/mcp-journal-sqlite` | 0.1.0 | Journal adapter API v1 (SQLite) |
| `compat/*` | — | — | Historical wrappers, not workspaces |

Bun 1.4.5 workspace (`apps/*`, `adapters/*`) with one root `bun.lock`.
Public package names, bins (`kaiten`, `opencode-mcp`, `oc2-mcp`), exports and
independent versions are preserved. Standalone CLIs remain usable.

## 2. Source-owned modules

Both apps expose a side-effect-free `./module` subpath. Importing performs no
I/O; version/config/service resolution happens in `start()` or on first call.

- **Kaiten**: `src/mcp/module.ts` + `tool-runtime.ts`. The runtime builds the
  registry, draft-07 schemas, annotations, `taskSupport: "optional"` and the
  logging/error hook chain. The standalone server (`bootstrap.ts`) uses the
  same runtime, so one implementation serves both routes. Scoped `KAITEN_*`
  config is loaded from the module env; credentials stay lazy; `process.env`
  is never mutated. Permissions: `destructive` only, fail-closed.
- **OpenCode**: `src/module.ts` connects with the scoped `OPENCODE_*` env,
  builds the native `McpServer` and bridges it in-process via core's
  `InMemoryForwarder`. Discovery, model selection, permission guards, events,
  steer and result shapes keep their original code. Permission flags are
  forced on/off from module config; env is a copy.
- Core shares the contract (`ToolModule` API v1), forwarding, lifecycle and
  in-memory seam. Adapters own host resolution and scoped config only.

No child process is spawned for either module. E2E tests prove the aggregated
`tools/list` is deep-equal to each app's standalone server output.

## 3. Configuration

Resolved directory: `NONES_CONFIG_DIR` → `XDG_CONFIG_HOME/nones` →
`~/.config/nones`.

- `config.json`: shared `version`, `modules`, `logLevel`, `journal`.
- `modules/<id>.json`: private `enabled`, `permissions`, literal `env`,
  `envFrom`, module `options`.
- `env` keys must use the module prefix and may not be credential-like;
  credentials use `envFrom`. Sources and destinations are prefix-checked, so
  one module cannot import another's secrets. Loader variables (`PATH`,
  `NODE_OPTIONS`, `LD_*`, `DYLD_*`, `BUN_*`, `NONES_*`) are denied.
- Permissions default to all-false and cannot be set in shared config.
- Unknown keys fail closed. Module configs are never merged.

## 4. Journal extraction

The 0.5.0 contract, config resolution, validation, policy, loader and read
helpers now live in `apps/core/src/journal/` (API v1: `record/query/stats/close`).
The SQLite database implementation lives in `adapters/sqlite` and keeps the
0.5.0 schema (`journal_entries`, `application_id` `OMJ1`, `user_version` 1),
file permissions, cursor format and default path
(`XDG_STATE_HOME/nones/journal.sqlite`).

- Existing `~/.config/nones/config.json` `journal` keys are readable:
  `enabled`, `capturePrompts`, `sqlitePath`, `adapter: {module, options}`.
- `adapter.module` may be an absolute/relative/`~`/`file:` path or an already
  installed package name (resolved with `import.meta.resolve`); nothing is
  downloaded. A path is never required by tests.
- `capturePrompts: false` strips prompts before the adapter sees a record;
  list reads omit prompts unless `includePrompts` is set.
- Operation names and CLI capture stay in OpenCode (`opencode.session.*`,
  `opencode.service.start`). Core does not invent operations.
- Core's aggregate server loads/validates journal settings but does not record
  MCP tool calls; journaling is still CLI-driven.
- `@nones/mcp-journal-sqlite` is optional for core (dynamic import, clear error
  when absent) and a normal dependency of OpenCode.

## 5. Verified checks

```
bun install --frozen-lockfile
bun run verify   # build → typecheck → lint → tests → pack:check
```

- Core: 32 tests (config separation, legacy journal keys, installed custom
  adapter, built-in SQLite round-trip/reopen, prompt exclusion, duplicate tools,
  discovery parity for both apps, errors, cancellation, Node/Bun CLI, stdout).
- Kaiten: 438 tests (imported suite + module contract, scoped env, fail-closed
  DELETE permission, optional taskSupport).
- OpenCode: 102 tests (imported suite + source module discovery/call/close).
- SQLite adapter: 2 tests (schema identity, idempotent record, reopen).
- `pack:check` dry-runs every package, requires `./module` where applicable,
  resolves packed declarations and rejects `src/` in tarballs.

## 6. Known limits

- Async MCP tasks are not proxied: `taskSupport` is discovery metadata only and
  a `task` parameter is not forwarded.
- `tools.listChanged` stays `false` in the aggregate; resources/prompts are not
  aggregated.
- Journaling is not applied to OpenCode MCP tool calls (only existing CLI
  operations), matching 0.5.0.
- Kaiten `permissions.admin`/`exec` and module `options` are rejected.
- Kaiten keeps Node `>=18`; core, OpenCode, the adapter and the root require
  Node `>=22.14` (node:sqlite).

## 7. Local cutover (not applied)

Keep legacy MCP entries in place, add one stdio entry named `nones-mcp`, and
point `NONES_CONFIG_DIR` at the shared directory. Stop the standalone OpenCode
journal writer before enabling the same database from any other process.

```json
// config.json
{ "version": 1, "modules": ["kaiten", "opencode"], "logLevel": "info",
  "journal": { "enabled": true, "capturePrompts": false } }
```

```json
// modules/kaiten.json
{ "version": 1,
  "permissions": { "destructive": false },
  "env": { "KAITEN_API_URL": "https://kaiten.example/api/latest" },
  "envFrom": { "KAITEN_API_TOKEN": "KAITEN_API_TOKEN" } }
```

```json
// modules/opencode.json
{ "version": 1,
  "permissions": { "destructive": false, "admin": false, "exec": false },
  "envFrom": { "OPENCODE_MCP_URL": "OPENCODE_MCP_URL",
               "OPENCODE_MCP_PASSWORD": "OPENCODE_MCP_PASSWORD" } }
```

Rollback is removing the new entry; legacy entries and package versions are
untouched. No real user or AIRun configuration was modified in this branch.
