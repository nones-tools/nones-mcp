# @nones/kaiten-module

Module adapter for the published `@nones/kaiten-mcp@4.3.0` (SDK v1). It only
resolves the installed host package and maps scoped config to its child
environment; discovery, schemas, results, errors and cancellation are handled
by core's shared `StdioForwarder`.

- Tools keep `execution.taskSupport: "optional"` verbatim.
- The Kaiten server negotiates no `tasks` capability, so core creates no MCP
  tasks either.
- `permissions.destructive` maps to `KAITEN_API_DELETE_ALLOW`; `admin`/`exec`
  are rejected for this module.
- `KAITEN_*` variables are accepted through `envFrom` only; literal credentials
  are rejected.

Requires `@nones/mcp-core` at runtime (peer) and Node `>=22.14` or Bun.
