# Development

Toolchain is [Bun](https://bun.sh); the published package runs on plain Node >= 18.

```bash
bun install
bun run dev        # MCP server in watch mode (stdio)
bun run dev:cli    # CLI from sources
bun test           # full suite — no network or credentials needed
bun run typecheck  # tsc --noEmit (strict)
bun run build      # bundle to dist/ (Node target, deps external) + emit .d.ts
bun run pack       # build + create the npm tarball (bun pm pack)
```

## Testing the MCP server by hand

```bash
printf '%s\n%s\n%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | node dist/cli/index.js mcp
```

`node dist/mcp/server.js` (the `bun run start` / `bun run dev` entry) runs the exact same
`startMcpServer()` bootstrap from `src/mcp/bootstrap.ts` — the published way in is the
`kaiten mcp` subcommand.

## Project workflow

- Work items: **beads** (`bd ready`, `bd create`, `bd close`) — see `AGENTS.md`.
- Feature process: **Spec Kit** (`/speckit-specify` → `/speckit-plan` → `/speckit-tasks`
  → `/speckit-implement`); artifacts in `specs/`, principles in
  `.specify/memory/constitution.md`.
- Quality gates before any commit: `bun run lint`, `bun test` and `bunx tsc --noEmit` green.

## Releasing (CI/CD)

Releases are fully automated via GitHub Actions (`.github/workflows/release.yml`).
The workflow triggers **only** on a commit to `master` whose message is exactly
`chore: X.Y.Z` — regular commits never run CI.

```bash
bun run release patch      # or: minor | major | 3.4.0; add --no-push to hold the push
```

The script checks the working tree is clean, runs lint/typecheck/tests locally, bumps
`package.json`, rolls the CHANGELOG `## Unreleased` section into the new version,
commits `chore: X.Y.Z` and pushes. CI then re-runs all gates, builds, smoke-tests the
dist under plain Node, publishes `@nones/kaiten-mcp` to npm and the `@zeizel/kaiten-mcp`
mirror to GitHub Packages, tags `vX.Y.Z` and creates the GitHub Release with notes taken
from the CHANGELOG section.

Required repo secret: `NPM_TOKEN` — an npm granular access token with publish rights for
`@nones/kaiten-mcp` (and "bypass 2FA" enabled). `GITHUB_TOKEN` is provided by Actions
automatically. Keep changes for the next release under a `## Unreleased` heading in
`CHANGELOG.md` — the release script and CI notes depend on it.

Manual fallback for a private registry: `bun run pack` and push the tarball, or
`npm publish --registry=<url>`.
