# Changelog

## 0.3.0

Session-control release; the MCP transport, tool schemas, and SDK API are unchanged.

- Added `start`, `send`, `status`, `messages`, `sessions`, `monitor`/`watch`, and `run` to the globally installed CLI. They use the existing running OpenCode service, `OpenCodeClient`, native `ses_...` IDs, and native operations; there is no local job store, SQLite, Python dependency, or generated monitor.
- `start` validates the prompt, directory, and model before creation, creates the session, delivers with native steer, and prints the session ID plus admission receipt without waiting. Model resolution is `--model`, `OPENCODE_MCP_MODEL`, legacy `OC2_MODEL`, then `opencode-go/deepseek-v4.1-flash`; unknown models and variants fail without fallback, a fresh directory outside scoped mode falls back to the global native catalogue, and a failed submission keeps the created session ID in diagnostics.
- `send` submits immediately to the same session with steer (default) or queue and never creates or forks a session. `status`, `messages`, and `sessions` print readable native JSON with bounded limits and cursors.
- `monitor` emits newline-delimited JSON with initial status, filtered native events, and normalized turn-start, steer-delivered, tool-completed, idle, success, failure, and timeout events. It uses short bounded live reads plus `session.get` reconciliation, deduplicates terminal events, bounds cancellation and retries, and separates stream and snapshot failures.
- Monitor exit codes are 0 success, 2 failed/interrupted in until-turn mode, 124 timeout, and 130 signal; Ctrl+C never interrupts the native session. Follow mode keeps observing after a failed turn. `run` composes start and until-turn monitoring with a pre-prompt baseline for fast turns.
- Added the `oc2-mcp` bin alias pointing at the same `dist/cli.js` and documented session IDs versus legacy job IDs, monitor gap reconciliation, exit codes, model resolution, and managed service dependency.
- Admitted native `model.list` in scoped mode only with an explicit `query.location.directory` inside `OPENCODE_MCP_ALLOWED_DIRS`.
- Added focused Node CLI tests against a controlled service stub for start receipts, immediate steer, scoped model discovery, monitor busy/idle attach, terminal failure, timeout, signal, follow mode, and fast `run` completion, plus package checks for the alias and a Bun `--no-env-file` installed-build handshake.

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
