![Nones MCP — the Nones pixel octopus beside the Nones MCP wordmark](assets/brand/banner-nones-mcp.png)

# Nones MCP

**Nones MCP** is the Bun monorepo for the `@nones` MCP suite: one shared
runtime for [Kaiten](apps/kaiten), [OpenCode](apps/opencode) and the
[DeepSeek Harness session bundle](apps/dsh), plus a local operation journal. It
is developed at
[github.com/nones-tools/nones-mcp](https://github.com/nones-tools/nones-mcp).

## Packages

| Path | Package | What it does |
| --- | --- | --- |
| `apps/core` | `@nones/mcp-core` | Command registration, runtime and journal orchestration across all MCPs; single stdio entry `nones-mcp` |
| `apps/kaiten` | `@nones/kaiten-mcp` | Kaiten MCP server, `kaiten` CLI and typed SDK, with a `./module` export |
| `apps/opencode` | `@nones/opencode-mcp` | OpenCode 2 MCP server, CLI and SDK, with a `./module` export |
| `apps/dsh` | `@nones/dsh-session-mcp` | DeepSeek Harness Cordis bundle exposing live Harness conversations over a bearer-authenticated loopback MCP endpoint |
| `adapters/journal` | `@nones/journal` | Journal adapter implementations, including the built-in SQLite adapter at `@nones/journal/sqlite` |

`compat/*` contains historical wrappers kept for reference; they are not
workspaces.

`@nones/dsh-session-mcp` is published from this repository
([`apps/dsh`](apps/dsh)) and installed into a Harness profile with
`dsh plugin --profile <name> add @nones/dsh-session-mcp`. It is an in-Harness
bundle, not an aggregate module: the root `nones-mcp` gateway is built in a
separate worktree and reaching DSH from it would require a separate explicit
upstream.

Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing anything. The
[Nones Tools profile](docs/organization/profile/README.md) describes the suite
and links the legacy Kaiten and OpenCode histories.

## Verify

```sh
bun install --frozen-lockfile
bun run verify   # build → typecheck → lint → tests → pack:check
```

Tests run with an isolated `HOME` (`scripts/test.ts`), so a real
`~/.kaiten/config` or Harness profile cannot influence results. The DSH smoke
test starts a loopback endpoint against a stub controller and its own temporary
SQLite journal; no network, credentials, live OpenCode/Kaiten calls or model
inference are required.

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
- Keep journal orchestration and policy in core; adapters own durable storage.
- Keep standalone MCP and CLI entrypoints working during cutover.

## Documentation

- [Architecture and source migration](ARCHITECTURE.md)
- [Kaiten MCP](apps/kaiten/README.md) — [tools](apps/kaiten/docs/tools.md),
  [CLI](apps/kaiten/docs/cli.md), [configuration](apps/kaiten/docs/configuration.md),
  [SDK](apps/kaiten/docs/sdk.md)
- [OpenCode MCP](apps/opencode/README.md) — [specification](apps/opencode/docs/SPECIFICATION.md),
  [contributing](apps/opencode/CONTRIBUTING.md)
- [DeepSeek Harness session MCP](apps/dsh/README.md) — install, tools, settings and
  the in-Harness boundary
- [Built-in SQLite journal adapter](docs/adapters/sqlite.md)
- [Organization profile source](docs/organization/profile/README.md) and
  [legacy redirect text](docs/organization/legacy/README.md)

## License

MIT
