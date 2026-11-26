# @nones/opencode-module

Module adapter for the published `@nones/opencode-mcp@0.3.0` (SDK v2). It
resolves the installed package, verifies that the `oc2-mcp` alias points at the
same executable, and forwards discovery and calls through core's shared
`StdioForwarder`.

- Tool names, annotations, dynamic OpenAPI tools and `structuredContent` pass
  through unchanged.
- `permissions.destructive|admin|exec` map to
  `OPENCODE_MCP_ALLOW_DESTRUCTIVE|ADMIN|EXEC`; all default to off.
- Point it at a service with `OPENCODE_MCP_URL` via module `env`; credentials,
  if any, must use `envFrom` under the `OPENCODE_*` prefix.
- No service is started, restarted or replaced.

Requires `@nones/mcp-core` at runtime (peer) and Node `>=22.14` or Bun.
