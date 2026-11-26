# Contributing

OpenCode MCP is a small, safety-sensitive bridge to a live OpenCode service. Keep changes focused, test behavior rather than implementation details, and preserve the existing safety boundary.

## Setup

Bun 1.4.5 is the pinned build, formatter, and test runner. The packaged CLI targets Node 22.14 or newer. Formatting uses native `bun fmt`; linting uses `oxlint`.

```sh
bun install --frozen-lockfile
bun run format:check
bun run lint
bun run typecheck
bun run build
bun test
npm pack --dry-run
```

Run one test file with `bun test tests/client.test.ts` or `bun test tests/mcp.test.ts`. The Node stdio tests in `tests/mcp.test.ts` and `tests/cli.test.ts` spawn `dist/cli.js` by default, so build before the full suite. Set `OPENCODE_MCP_TEST_CLI` to point those tests at another built CLI. `tests/package.test.ts` packs the tarball, installs it into a fresh Node consumer, compiles a strict `NodeNext` fixture with `skipLibCheck: false`, and runs the installed CLI with Node; `tests/bun-package.test.ts` reuses the same fixture and launches the installed build with Bun using `--no-env-file` for a bounded stdio MCP handshake. Both need a completed build.

## Architecture

The source is split by responsibility under `src/`:

| Area                                          | Responsibility                                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `cli.ts` and `config.ts`                      | CLI commands, service discovery, endpoint validation, timeouts, and allowed directories. |
| `session-start.ts`, `session-read.ts`         | Start/send receipts and native status, message, and session projections.                 |
| `session-model.ts`, `prompt.ts`               | Model parsing/validation and bounded prompt input.                                       |
| `monitor.ts`, `monitor-state.ts`              | Bounded SSE reads, session.get reconciliation, turn state, and exit codes.               |
| `monitor-events.ts`, `monitor-cli.ts`         | Native-to-normalized events and signal-safe observation.                                 |
| `catalog.ts`                                  | Native `/openapi.json` operation discovery and filtering of unsafe routes.               |
| `http.ts`, `params.ts`, `json.ts`             | Bounded requests, route and query encoding, and JSON response handling.                  |
| `scope.ts` and `security.ts`                  | Workspace checks, capability gates, operation classification, and credential stripping.  |
| `events.ts` and `history.ts`                  | Bounded event reads and grouping of native messages by user prompt.                      |
| `server.ts`                                   | MCP tool registration, including dynamic tools for native operations.                    |
| `index.ts` and `types.ts`                     | Public SDK exports and interface-shaped request/operation types.                         |
| `globals.d.ts`                                | Ambient internal utility types shared by source and tests; never part of the public SDK. |
| `tests/client.test.ts`, `tests/stub.ts`       | Client routing, gate, and event tests against the local stub OpenCode service.           |
| `tests/session-*.ts`, `tests/monitor.test.ts` | Session CLI and monitor behavior against a controlled session stub.                      |
| `tests/mcp.test.ts`, `tests/cli.test.ts`      | Node stdio MCP handshake and `doctor` CLI checks against a built CLI.                    |
| `tests/package.test.ts`                       | Tarball contents, installed Node CLI, and strict NodeNext consumer declarations.         |
| `scripts/fix-declaration-imports.mjs`         | Adds NodeNext-compatible `.js` extensions to emitted declaration imports.                |
| `docs/SPECIFICATION.md`                       | Product, compatibility, and safety contract.                                             |

Request flow: the CLI resolves a connection, loads the native operation catalog, and registers MCP tools. Each call resolves path and query parameters, applies workspace scope and capability checks, makes one bounded request, sanitizes the result, and returns a native payload or an explicit error. History and events use the same client path so gates and scope are not bypassed.

## Testing

- Add tests for routing and parameter encoding, capability gating for named and generic paths, credential filtering, history grouping with steering and tool output, event filtering/cursors, the Node stdio MCP and CLI checks, and package/declaration consumption.
- Prefer the stub OpenCode service in `tests/stub.ts`; it keeps credentials and real chats out of the test path.
- For checks against a real OpenCode 2.4.1 service, use disposable sessions and workspaces, and do not modify real chats. Live checks can be gated in CI.
- Test the built package when changing CLI or MCP registration behavior: run `bun run build`, `npm pack --dry-run`, or the smoke install from CI.
- Never print passwords, tokens, authorization headers, or private chat content in tests, fixtures, logs, or issue reports.

## Review guidance

- Preserve fail-closed behavior. Unknown scope, unsupported operations, invalid parameters, and insufficient access should produce clear errors, not fallback requests.
- Do not weaken capability gates, `confirm` requirements, directory checks, redirect blocking, timeout or size bounds, secret filtering, or excluded credential/auth/pairing/RPC routes.
- Preserve upstream cursors and IDs. Do not invent cursors or emulate upstream operations that the installed version does not expose.
- Keep stdout protocol-only in MCP server mode, and never commit credentials or machine-specific service registrations.
- Keep TypeScript source and tests on extensionless relative imports. Do not hand-edit emitted declarations; the build normalizes them for NodeNext.
- Add tests for behavior changes. Update README, CHANGELOG, and package metadata when public behavior or packaging changes.
- Use the pull request template to state the change, verification steps, and any safety or scope impact.

## Pull requests

Keep diffs focused. Include the commands you ran, the behavior you tested, and any remaining limitation. The Verify workflow runs lint, typecheck, build, tests, and a package smoke install; expect the same checks locally. Do not include generated `dist/` output or package tarballs in a pull request.
