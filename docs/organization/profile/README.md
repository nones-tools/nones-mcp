<p align="center">
  <img src="https://raw.githubusercontent.com/nones-tools/nones-mcp/main/assets/brand/nones-tools-avatar.png" width="160" alt="Nones Tools mascot: a purple pixel-art octopus with teal tentacle tips and orange tool accents">
</p>

<h1 align="center">Nones Tools</h1>

<p align="center">
  <strong>MCP servers, a shared runtime core, and a local operation journal for the tools we use every day.</strong>
</p>

<p align="center">
  <a href="https://github.com/nones-tools/nones-mcp">Monorepo</a> ·
  <a href="https://www.npmjs.com/org/nones">npm</a> ·
  <a href="https://github.com/nones-tools/nones-mcp/blob/main/ARCHITECTURE.md">Architecture</a>
</p>

---

## What we build

The canonical source is the public monorepo
[`nones-tools/nones-mcp`](https://github.com/nones-tools/nones-mcp). It holds
four packages that are developed and tested together.

| Package | Workspace | Role |
| --- | --- | --- |
| [`@nones/mcp-core`](https://github.com/nones-tools/nones-mcp/tree/main/apps/core) | `apps/core` | Command registration, runtime and journal orchestration across all MCPs; the single `nones-mcp` stdio entry |
| [`@nones/kaiten-mcp`](https://github.com/nones-tools/nones-mcp/tree/main/apps/kaiten) | `apps/kaiten` | Kaiten MCP server with 58 tools for boards, cards, checklists and comments, plus the `kaiten` CLI and a typed SDK |
| [`@nones/opencode-mcp`](https://github.com/nones-tools/nones-mcp/tree/main/apps/opencode) | `apps/opencode` | OpenCode 2 MCP server, session CLI and TypeScript SDK |
| [`@nones/journal`](https://github.com/nones-tools/nones-mcp/tree/main/adapters/journal) | `adapters/journal` | Journal adapter implementations, including the built-in SQLite adapter at `@nones/journal/sqlite` |

Each server still ships and works on its own: existing `kaiten` and
`opencode-mcp` registrations, bins, exports and configuration remain valid.
The monorepo adds the option to run both through `nones-mcp`.

## The 5.0.0 architecture

In the 5.0.0 line, `@nones/mcp-core` is the runtime for the whole suite, not a
thin wrapper around one app. It owns command registration, the module runtime,
configuration loading and journal orchestration across every MCP. Kaiten and
OpenCode expose their tools through that shared contract, so the aggregated
`nones-mcp` entry and the standalone servers run the same code paths.

`@nones/journal` supplies journal adapter implementations behind versioned
adapter API v1. SQLite is the built-in adapter, published as the
`@nones/journal/sqlite` subpath; core decides when a journal is opened and what
is recorded, while the adapter owns durable storage. Nothing is downloaded or
discovered from the working directory at runtime, and credentials still resolve
through scoped configuration and `envFrom` rather than literals.

## Get started

```sh
# Kaiten MCP
npx -y @nones/kaiten-mcp mcp

# OpenCode MCP
npm install -g @nones/opencode-mcp
opencode-mcp mcp
```

From the monorepo, `bun install --frozen-lockfile` followed by
`bun run verify` builds, typechecks, lints and tests every package. See the
[root README](https://github.com/nones-tools/nones-mcp#verify) for the full
sequence and [ARCHITECTURE.md](https://github.com/nones-tools/nones-mcp/blob/main/ARCHITECTURE.md)
for the runtime and configuration model.

## Repositories and history

- **Canonical monorepo** — [nones-tools/nones-mcp](https://github.com/nones-tools/nones-mcp).
  Current source:
  [apps/core](https://github.com/nones-tools/nones-mcp/tree/main/apps/core),
  [apps/kaiten](https://github.com/nones-tools/nones-mcp/tree/main/apps/kaiten),
  [apps/opencode](https://github.com/nones-tools/nones-mcp/tree/main/apps/opencode),
  [adapters/journal](https://github.com/nones-tools/nones-mcp/tree/main/adapters/journal).
- **Legacy Kaiten repository** —
  [nones-tools/kaiten-mcp](https://github.com/nones-tools/kaiten-mcp). Its
  history is preserved on the
  [`legacy/kaiten-master`](https://github.com/nones-tools/nones-mcp/tree/legacy/kaiten-master)
  branch of the monorepo.
- **Legacy OpenCode repository** —
  [nones-tools/opencode-mcp](https://github.com/nones-tools/opencode-mcp). Its
  history is preserved on the
  [`legacy/opencode-main`](https://github.com/nones-tools/nones-mcp/tree/legacy/opencode-main)
  branch of the monorepo.

Changelogs and docs stay with the current source:
[kaiten changelog](https://github.com/nones-tools/nones-mcp/blob/main/apps/kaiten/CHANGELOG.md),
[kaiten docs](https://github.com/nones-tools/nones-mcp/tree/main/apps/kaiten/docs),
[opencode changelog](https://github.com/nones-tools/nones-mcp/blob/main/apps/opencode/CHANGELOG.md),
[opencode docs](https://github.com/nones-tools/nones-mcp/tree/main/apps/opencode/docs).

## Legacy README redirects

The old default repositories can point their READMEs at the monorepo with the
following prepared assets and notices.

| Old default repository | Banner | Migration notice |
| --- | --- | --- |
| [nones-tools/kaiten-mcp](https://github.com/nones-tools/kaiten-mcp) | `apps/kaiten/docs/assets/banner.png` | [`docs/organization/legacy/kaiten-mcp.md`](https://github.com/nones-tools/nones-mcp/blob/main/docs/organization/legacy/kaiten-mcp.md) |
| [nones-tools/opencode-mcp](https://github.com/nones-tools/opencode-mcp) | `apps/opencode/docs/assets/banner.png` | [`docs/organization/legacy/opencode-mcp.md`](https://github.com/nones-tools/nones-mcp/blob/main/docs/organization/legacy/opencode-mcp.md) |

Each banner is also served from
`https://raw.githubusercontent.com/nones-tools/nones-mcp/main/<path>`; each
notice file carries the matching banner, install command and history links.

Shared migration notice: _Kaiten MCP and OpenCode MCP are now developed in
nones-tools/nones-mcp. Package names, commands, changelogs and docs are
unchanged._

## Routes

- Kaiten MCP setup, configuration and guardrails:
  [apps/kaiten/README.md](https://github.com/nones-tools/nones-mcp/blob/main/apps/kaiten/README.md)
- OpenCode MCP setup, CLI and journal usage:
  [apps/opencode/README.md](https://github.com/nones-tools/nones-mcp/blob/main/apps/opencode/README.md)
- SQLite built-in adapter and journal notes:
  [docs/adapters/sqlite.md](https://github.com/nones-tools/nones-mcp/blob/main/docs/adapters/sqlite.md)
- npm packages: [npmjs.com/org/nones](https://www.npmjs.com/org/nones)

## License

MIT for the code. The pixel octopus is the Nones Tools mascot.
