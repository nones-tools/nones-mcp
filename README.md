# nones-mcp

Bun 1.4.5 monorepo for the `@nones` MCP suite:
[github.com/nones-tools/nones-mcp](https://github.com/nones-tools/nones-mcp).

- `apps/core` — `@nones/mcp-core`, single stdio entry `nones-mcp`
- `apps/kaiten` — `@nones/kaiten-mcp@4.3.0` source + `./module` export
- `apps/opencode` — `@nones/opencode-mcp@0.5.0` source + `./module` export
- `adapters/sqlite` — `@nones/mcp-journal-sqlite@0.1.0` (journal API v1)
- `compat/*` — historical wrappers kept for reference, not workspaces

Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing anything.

## Verify

```sh
bun install --frozen-lockfile
bun run verify   # build → typecheck → lint → tests → pack:check
```

Tests run with an isolated `HOME` (`scripts/test.ts`), so a real
`~/.kaiten/config` cannot influence results. No network, credentials, or live
OpenCode/Kaiten calls are required.

## Serve

```sh
node apps/core/dist/bin.js doctor
node apps/core/dist/bin.js          # stdio MCP; stdout is protocol-only
```

Configuration lives in `NONES_CONFIG_DIR`, else `$XDG_CONFIG_HOME/nones`, else
`~/.config/nones`: shared `config.json` and private `modules/<id>.json`.
Credentials go through `envFrom`, never literal values. See ARCHITECTURE.md §7
for the local cutover shape.

## Rules

- Keep public names, bins, exports and independent versions.
- Do not load code from CWD or download packages at runtime.
- Do not mutate `process.env` to inject module credentials.
- Keep journal capture CLI-specific to OpenCode; core owns contract/config/loader.
- Keep standalone MCP and CLI entrypoints working during cutover.
