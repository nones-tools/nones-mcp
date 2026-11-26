# Architecture

Repository: `github.com/nones-tools/nones-mcp`. The workspace is a coordinated
5.1.0 release; local changes do not publish or write to remotes.

## 1. Layout

| Path | Package | Version | Role |
| --- | --- | --- | --- |
| `apps/core` | `@nones/mcp-core` | 5.1.0 | Shared action registry, stdio entry `nones-mcp`, journal orchestration |
| `apps/kaiten` | `@nones/kaiten-mcp` | 5.1.0 | Kaiten MCP server, `kaiten` CLI and SDK; `./module` export |
| `apps/opencode` | `@nones/opencode-mcp` | 5.1.0 | OpenCode MCP server, CLI and SDK; `./module` export |
| `apps/dsh` | `@nones/dsh-session-mcp` | 5.1.0 | Cordis Host bundle for DeepSeek Harness sessions; HTTP MCP endpoint |
| `adapters/journal` | `@nones/journal` | 5.1.0 | Journal adapter collection; SQLite at `@nones/journal/sqlite` |
| `compat/*` | — | — | Historical wrappers, not workspaces |

Bun 1.4.5 workspace (`apps/*`, `adapters/*`) with one root `bun.lock`. Public
package names, bins (`kaiten`, `opencode-mcp`, `oc2-mcp`), exports and the
coordinated version are checked by `scripts/release/`.

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
  builds the native server and bridges it in-process through core. Discovery,
  model selection, permission guards, events, steer and result shapes keep
  their original code. Permission flags are forced on/off from module config;
  env is a copy.
- Core shares the contract (`ToolModule` API v1), forwarding, lifecycle,
  `ActionRegistry` surface and journaling. Adapters own host resolution and
  scoped config only.

No child process is spawned for either module. E2E tests prove the aggregated
`tools/list` is deep-equal to each app's standalone server output.

### DeepSeek Harness bundle

`apps/dsh` is different on purpose: it is a Cordis Host bundle, not a
`./module` that the root aggregate can load. Installing it into a Harness
profile starts a bearer-authenticated loopback endpoint inside the process that
owns `ctx.sessionController`, so `session_send` reaches the live conversation.
The Host half keeps the original `cordis.patch.yml`, the Client half keeps the
`@deepseek-ai/dsh-client-ui-settings` tab and localized labels, and the eleven
tool names, schemas and titles are frozen by a regression fixture copied from
the public 1.4.0 release.

Protocol construction and journaling use `@nones/mcp-core`:
`createActionRegistry` + `registryTools` feed `createToolServer`, and the MCP
SDK's `createMcpHandler` keeps modern and 2025-era HTTP clients working. The
core `JournalSink` writes through the configured adapter; the default is
`@nones/journal/sqlite`. `src/log.ts` remains only a bounded in-memory observer
for the Settings "recent five" card. No prompts, arguments, results or tokens
are journalled, and the endpoint never logs the token.

The root `nones-mcp` gateway remains the owner of aggregate/remote modules and
is developed in a separate worktree. DSH stays out of that aggregate: bridging
it there would need a separate explicit upstream, endpoint and token. No relay,
proxy or no-auth mode is opened.

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

## 4. Journal

Core owns the complete journal contract and lifecycle in
`apps/core/src/journal/` (API v1: `record/query/stats/close`). The SQLite
implementation is the built-in plugin in `adapters/journal/src/sqlite/`,
published as `@nones/journal/sqlite`; core imports it dynamically and reports a
clear error when the adapter is not installed. The retired
`@nones/mcp-journal-sqlite` name is accepted only as a narrow config alias.

Every surface records at one boundary:

- MCP tools/call: `<integration>.mcp.<frozen tool name>`, exactly once per call.
- CLI actions: `<integration>.cli.<command>`, or the preserved
  `opencode.session.*` / `opencode.service.start` IDs.
- Help, version, `mcp`, `journal` reads and app-owned readiness probes are
  excluded. The OpenCode readiness child sets core's explicit
  `NONES_MCP_JOURNAL_SUPPRESS=1` opt-out; normal MCP processes never do.

Records contain metadata only: ID, UTC time, operation, outcome, duration and
optional native session/message IDs. Arguments, tool results, error bodies and
stdout are never stored. An authorized prompt is stored only for
`opencode.session.start|send|run`, and only while `capturePrompts` is true;
list reads omit prompts unless `--include-prompts` is passed. `capturePrompts:
false` strips prompts in core before any adapter, including a custom one, sees
the record.

Config compatibility (`enabled`, `capturePrompts`, `sqlitePath`,
`adapter: {module, options}`), the 0.5.0 schema (`journal_entries`,
`application_id` `OMJ1`, `user_version` 1), file permissions, cursor format and
default path (`XDG_STATE_HOME/nones/journal.sqlite`) are preserved. Custom
adapters receive their configured JSON `options`; packages are resolved, never
downloaded.

## 5. Release

One root tag `vX.Y.Z` releases all five packages from one commit in dependency
order: core, journal, kaiten, opencode, dsh. Root scripts expose the same tool:

```sh
bun install --frozen-lockfile
bun run release:version -- 5.1.0 --write
bun run verify
bun run release:test
```

`version` synchronizes root plus all five workspace versions, pins every
internal `@nones/*` dependency to the exact release version and updates the
root lock. `pack`/`publish` validate the tag, commit, checksums, declarations
(including DSH's wildcard locale export and host/client entry points) and
install smoke. There is no DSH-specific release workflow. See
[docs/release.md](docs/release.md).

## 6. Verified checks

```
bun install --frozen-lockfile
bun run verify   # build → typecheck → lint → tests → pack:check
node --test scripts/release.test.mjs
```

`pack:check` dry-runs every package, requires `./module` where applicable,
resolves packed declarations and rejects `src/` in tarballs. The release suite
uses synthetic manifests and mocked npm interactions.

## 7. Known limits

- Async MCP tasks are not proxied: `taskSupport` is discovery metadata only and
  a `task` parameter is not forwarded.
- `tools.listChanged` stays `false` in the aggregate; resources/prompts are not
  aggregated.
- Kaiten `permissions.admin`/`exec` and module `options` are rejected.
- Kaiten keeps Node `>=18`; core, OpenCode, DSH, the adapter and the root
  require Node `>=22.14` (`node:sqlite`).
- DSH is not an aggregate module. It is served only by its in-Harness Cordis
  bundle; the root gateway does not proxy it.
- One process should own a journal database at a time; SQLite WAL allows
  short-lived concurrent readers, not multiple long-running writers.
