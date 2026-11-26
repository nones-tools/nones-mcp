# Architecture and migration

Status: **prototype / prep turn**. Nothing here publishes packages, creates
GitHub repositories, rewrites standalone source histories, opens the journal, or
edits real user/AIRun MCP configs.

## 1. Shape of the prototype

| Path | Package | Version | Role |
| --- | --- | --- | --- |
| `apps/core` | `@nones/mcp-core` | 0.1.0 | Single stdio MCP entry `nones-mcp` |
| `apps/kaiten` | `@nones/kaiten-module` | 0.1.0 | Adapter for `@nones/kaiten-mcp@4.3.0` (SDK v1) |
| `apps/opencode` | `@nones/opencode-module` | 0.1.0 | Adapter for `@nones/opencode-mcp@0.3.0` (SDK v2) |
| `adapters/sqlite` | — | — | Contract and design only until OpenCode 0.5.0 is extracted |

The root is a private Bun 1.4.5 workspace (`apps/*`, `adapters/*`) with one
frozen `bun.lock`. Every package keeps Node `>=22.14` and runs unchanged under
Node or Bun because adapters spawn `process.execPath` with the host package's
own bin path.

## 2. Runtime model

`nones-mcp` is the only stdio entry. It owns stdout exclusively; all logging
and child stderr go to stderr.

1. Config is loaded from `$NONES_CONFIG_DIR`, else `$XDG_CONFIG_HOME/nones`,
   else `~/.config/nones`.
2. Only ids in `apps/core/src/trust.ts` may load. Config cannot name an entry
   path, command, args or CWD.
3. A module package is resolved with `import.meta.resolve()` from core's own
   location, never from `process.cwd()`, and loaded only if it exports
   `apiVersion: 1`, the expected `id`, a `version` and `start()`.
4. Tools from all modules are indexed once. Duplicate names, invalid names and
   missing JSON Schemas fail startup and start-up is rolled back.
5. `tools/list` returns child metadata verbatim: name, title, description,
   input/output schema, annotations, icons and `execution.taskSupport`.
6. `tools/call` forwards arguments, results and JSON-RPC errors. Tool-level
   `isError` results pass through unchanged.
7. Shutdown (signal, transport EOF, failure) aborts module signals and closes
   every owned child transport in reverse startup order.

Shared forwarding lives in `apps/core/src/forward.ts` (`StdioForwarder`).
Adapters only resolve their host package and map scoped config/permissions to
the child environment, so there is one implementation of stdio framing,
error conversion and cancellation.

## 3. Config model

Three independent inputs; none can alter another:

- `config.json` — shared: `version` (optional, defaults 1), `modules` order,
  `logLevel`, and the **legacy top-level `journal` object** used by standalone
  OpenCode 0.5.0.
- `journal.json` — optional dedicated replacement; wins over the legacy key
  with a warning. Same fields as the legacy object.
- `modules/<id>.json` — private per-module: `enabled`, `permissions`, literal
  `env`, `envFrom` references, and module `options` validated by the adapter.

Journal fields accepted today: `enabled`, `capturePrompts`, `sqlitePath`,
`adapter: { module, options }`. Settings are validated and reported, but core
does **not** open, create or write the journal before the SQLite extraction.
Legacy `config.json` with `journal` as its only key is valid and covered by a
compatibility test.

Safety rules enforced at load time:

- Unknown keys fail closed in every file.
- Literal `env` keys may not be credential-like; credentials must use
  `envFrom` so files never contain secrets.
- Destinations and sources of `envFrom` must use the module's own prefix
  (`KAITEN_*`, `OPENCODE_*`), so one module cannot import another module's
  credentials.
- `PATH`, `HOME`, `NODE_OPTIONS`, `NODE_PATH`, `BUN_*`, `LD_*`, `DYLD_*`,
  `NONES_*` and similar loader variables are denied on both sides of `envFrom`.
- Permissions default to `{destructive:false, admin:false, exec:false}` and are
  module-scoped. Kaiten accepts only `destructive`; OpenCode maps all three to
  its documented `OPENCODE_MCP_ALLOW_*` flags.
- Logs scrub resolved secret values and URL userinfo.

Adapters spawn children with an allowlisted base environment plus resolved
module env only; no ambient `KAITEN_*`/`OPENCODE_*` variables survive. The child
CWD is the module's private `state/<id>` directory, so project `.env` files are
never picked up implicitly.

## 4. Verified compatibility (this turn)

- Kaiten 4.3.0 advertises 60 tools, each with `execution.taskSupport:
  "optional"`, and its server capabilities contain only `tools` — no `tasks`.
  Core preserves that metadata and also negotiates no `tasks` capability.
- A task-augmented `tools/call` degrades to the synchronized call path: the
  `task` parameter is not forwarded, exactly matching a child that never
  negotiated task support. No MCP task objects are created or proxied, so a
  client must not expect `tasks/get` behaviour from this prototype.
- OpenCode 0.3.0 advertises four base tools plus one tool per safe OpenAPI
  operation; the `oc2-mcp` alias resolves to the same `dist/cli.js`.
- `tools/list` output for both children is deep-equal to the child's own
  output after JSON normalization — no renaming, rewriting or schema
  regeneration.
- Errors: unknown tools return `-32602`; child JSON-RPC errors keep the child
  code and message; tool results keep `content`, `structuredContent`, `isError`.
- Cancellation is propagated as MCP `notifications/cancelled`; the shared child
  transport stays open so an immediate follow-up call succeeds. Transports are
  closed on shutdown.

## 5. Known limits

- Async MCP tasks are not proxied (see above); `taskSupport` is metadata only.
- Only tools are aggregated. Resources, prompts and sampling are not forwarded.
- `tools.listChanged` is `false`; the core publishes a static aggregate.
- Child stderr is inherited into the core's stderr, which is correct for stdio
  purity but means module diagnostics share one stream.
- Adapters still launch the published packages as subprocesses. In-process
  registration is the migration target, not the current state.
- `workspace:*` dev dependencies are prototype-only; published adapters must
  declare a concrete `@nones/mcp-core` peer range.

## 6. Migration plan

### Phase 1 — import public histories

Import `github.com/ZeiZel/kaiten-mcp` and `github.com/ZeiZel/opencode-mcp`
into `apps/kaiten` and `apps/opencode` with their commit history intact
(`git subtree` or `filter-repo` into the target path). Originals stay public,
untouched and independently installable. No history rewriting, no force push
to the originals. Standalone bins (`kaiten`, `opencode-mcp`, `oc2-mcp`) and
their npm versions remain the compatibility surface.

### Phase 2 — in-process modules

Replace each subprocess wrapper with native registration inside the imported
package, exporting the same `ToolModule` shape and the same tool definitions.
Keep schema snapshots captured from the published versions and require an
exact match before switching. The aggregate `tools/list` must remain
deep-equal, including Kaiten's `taskSupport: "optional"`. Keep the
subprocess adapter as a fallback for one minor release.

### Phase 3 — SQLite journal

After OpenCode 0.5.0 exposes its journal code, extract it into
`adapters/sqlite` implementing the shared `JournalAdapter` contract. Reuse the
existing `capturePrompts`/`sqlitePath`/`adapter` settings unchanged. Exactly one
writer: the standalone 0.5.0 process or the module, never both. Gate the switch
behind an explicit config value, and never open the journal when disabled.

### Phase 4 — release cutover

Publish `@nones/mcp-core` and module packages under independent versions.
Adapters declare concrete core peer ranges. The legacy packages stay published
and installable with their own CLIs; deprecate only after one stable minor with
no schema drift. A compatibility matrix records core ↔ module ↔ host version
per release.

### Phase 5 — real configs (not this turn)

User-level and AIRun MCP configs switch only after: metadata parity, task
capability parity, cancellation and shutdown tests, journal single-writer
proof, and a rollback path to the legacy entry. No real config is modified now.

The target user-level registration is one stdio entry; legacy entries stay
untouched during the rollback window:

```json
{
  "mcpServers": {
    "nones": { "command": "nones-mcp", "args": [] }
  }
}
```

AIRun would receive the same shape through its own configuration mechanism,
with the executable path resolved per host image. Both switches are gated on
the checklist above and a rehearsal with journal disabled; neither is part of
this prototype.

## 7. Verification commands

```sh
bun install --frozen-lockfile
bun run build
bun run typecheck
bun test
bun run pack:check
```

`bun test` covers config resolution/validation, legacy journal compatibility,
credential isolation, duplicate-name rejection, module API validation,
combined discovery for both real installed entrypoints, ordinary and
task-capable discovery, byte-for-byte metadata parity, health/server-info
calls, error codes, cancellation, Node/Bun CLI execution, stdout purity and
graceful shutdown.
