# Changelog

## 0.2.1

CLI and packaging release; MCP transport, tool schemas, and the public SDK API are unchanged.

- Replaced the hand-rolled argument dispatcher with Commander.js 15.1.0, registering `mcp` and `doctor` as commands with asynchronous `parseAsync` handlers while keeping the same stdio transport and `doctor` diagnostics.
- Added built-in `help [command]`, `--help`/`-h`, and `--version`/`-V`; root and per-command help include descriptions, examples, and diagnostic notes, and work without a reachable OpenCode service.
- Kept the no-argument launch running the stdio MCP server, now by parsing `["mcp"]`, and kept invalid commands/options nonzero with stderr diagnostics before any connection.
- Bundled the package version into the CLI and MCP serverInfo from package.json metadata at build time; both report 0.2.1 under Node.
- Extended CLI and MCP tests for help aliases, command help, version, invalid input, and a real Node default-launch handshake, and added an installed-SDK Node load and version assertions to packaging checks.
- Added a copyable README "Set up with an agent" prompt covering global installation, user-level client registration, managed discovery, verification, and conservative capabilities.

## 0.2.0

Tooling, type-surface, and packaging release; runtime behavior is unchanged.

- Removed Biome. Formatting now uses native `bun fmt` with a `format:check` gate, and linting uses `oxlint`; Bun 1.4.5 is pinned for local and CI use.
- Switched all TypeScript source and test imports to extensionless relative specifiers, including type-only imports.
- Converted object-shaped type aliases to interfaces; unions, primitives, and generic/function utilities remain aliases. Internal project-wide utilities live in ambient `src/globals.d.ts`, while public signatures use self-contained structural types.
- Kept `tsc` declaration emit and added a narrow post-build normalization step so emitted declaration imports resolve for an external `NodeNext` consumer without invisible global types.
- Added package tests that pack and install the tarball into a fresh consumer, compile a strict `NodeNext` fixture with `skipLibCheck: false`, and run the installed CLI with Node.
- Updated README, CONTRIBUTING, specification, issue templates, and Verify/Release workflows for the new toolchain and checks.

## 0.1.1

Documentation, refactoring, and packaging release.

- Refactored the runtime into classes with shared helpers for connection, catalog, transport, workspace scope, events, history, and tool registration.
- Tool results and `doctor` output now use indented JSON while structured content keeps the native data shape.
- Rewrote the README with quick start, Codex and generic stdio setup, list/steer/history/event examples, and connection safety notes.
- Added CONTRIBUTING.md, CODEOWNERS, pull request and issue templates, and the NONES banner.
- Included CONTRIBUTING.md and the banner in the npm package, bumped the package version, and formatted handwritten JSON config with two spaces.

## 0.1.0

Initial OpenCode MCP server, CLI, and SDK with native operation discovery, grouped history, bounded event streams and central safety gates.
