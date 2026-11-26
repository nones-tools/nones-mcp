[![OpenCode MCP — NONES](docs/assets/banner.svg)](https://www.npmjs.com/org/nones)

# OpenCode MCP

`@nones/opencode-mcp` is a local MCP server, Node CLI, and TypeScript SDK for an **already running** OpenCode 2 service. The initial compatibility target is OpenCode 2.4.1. It connects to the service that is already there and never starts, restarts, or replaces it. Node 22.14 or newer is required for the packaged CLI.

## Quick start

Install globally and check the connection:

```sh
npm install -g @nones/opencode-mcp
opencode-mcp doctor
```

`doctor` discovers the managed OpenCode service, reads `server.info`, and reports available operations without printing credentials. Shipped commands are `opencode-mcp mcp` (the default), `opencode-mcp doctor`, and `opencode-mcp help` (`--help` and `-h` are aliases). In `mcp` mode, stdout carries MCP protocol traffic only; use stderr for diagnostics.

### Codex

Add the server to `~/.codex/config.toml`:

```toml
[mcp_servers.opencode]
command = "opencode-mcp"
args = ["mcp"]
```

### Generic stdio client

Any MCP client that can launch a stdio server can use:

```json
{
  "mcpServers": {
    "opencode": {
      "command": "opencode-mcp",
      "args": ["mcp"]
    }
  }
}
```

## Connection and configuration

With no configuration, the CLI discovers the authenticated managed service through the official `@opencode/client/service` adapter. `OPENCODE_MCP_SERVICE_FILE` can point to a non-default OpenCode-managed registration file. An explicit endpoint uses `OPENCODE_MCP_URL` and, when needed, Basic authentication as user `opencode`.

| Variable                         | Purpose                                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `OPENCODE_MCP_URL`               | Use an explicit endpoint instead of discovery. Loopback is the default; a remote host requires HTTPS and `OPENCODE_MCP_ALLOW_REMOTE=1`.                |
| `OPENCODE_MCP_PASSWORD`          | Basic-auth password for user `opencode` when `OPENCODE_MCP_URL` is set. Pass it through the environment, never a committed config or command argument. |
| `OPENCODE_MCP_SERVICE_FILE`      | Path to an OpenCode-managed service registration passed to the discovery adapter.                                                                      |
| `OPENCODE_MCP_ALLOW_REMOTE`      | Set to `1` to allow a remote HTTPS endpoint.                                                                                                           |
| `OPENCODE_MCP_TIMEOUT_MS`        | Request timeout from 100 to 120000 ms. Default: 30000.                                                                                                 |
| `OPENCODE_MCP_ALLOWED_DIRS`      | Platform path-delimited list of existing directories that bounds project and session scope.                                                            |
| `OPENCODE_MCP_ALLOW_DESTRUCTIVE` | Set to `1`, plus per-call `confirm: true`, to allow deletion, filesystem writes, and rollback/commit operations.                                       |
| `OPENCODE_MCP_ALLOW_ADMIN`       | Set to `1`, plus `confirm: true`, to allow plugin updates, global configuration, and other unclassified mutations.                                     |
| `OPENCODE_MCP_ALLOW_EXEC`        | Set to `1`, plus `confirm: true`, to allow explicit shell, command, and PTY operations.                                                                |

Capability flags enable only when the value is exactly `1`; any other value leaves the capability off. Confirmation must be exactly `true`.

## Safety and scope

- Requests use the configured origin, reject redirects, and are bounded by timeout and response size. A timed-out mutation may already have completed; check its outcome before retrying.
- `OPENCODE_MCP_ALLOWED_DIRS` is checked against canonical filesystem paths. Session and project lists are filtered to allowed workspaces, creation requires an allowed `body.location.directory` and checks any parent session, and operations whose scope cannot be verified are rejected.
- The scope filter is not a multi-user isolation boundary for the OpenCode server itself. All projects and chats on the attached server are visible by default.
- Credential, authorization provisioning, pairing, and RPC tunnel routes are excluded. Sensitive fields are stripped from responses and errors.
- MCP clients can see chat content and tool output, so attach only trusted clients. In server mode, stdout is reserved for the MCP transport; never put passwords in command arguments or committed configuration.

## Tools

| Tool                      | Use                                                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `opencode_operations`     | List discovered native operation IDs, methods, paths, parameter names, and safety categories. Optional `filter` narrows the list. |
| `opencode_request`        | Call exact operation ID with `{ operation, path?, query?, body?, confirm? }`.                                                     |
| `opencode_<operation_id>` | Call a native operation directly. Dots and other unsupported characters in the ID become underscores.                             |
| `opencode_history`        | Group native messages by user prompt with `{ sessionID, cursor?, limit? }`.                                                       |
| `opencode_events`         | Read a bounded slice of live or per-session log events with `{ sessionID?, source?, types?, after?, limit?, durationMs? }`.       |

The dynamic tools take the same parameters as `opencode_request` except `operation`. Native operations may differ between OpenCode versions: inspect the catalog rather than assuming a route exists.

## Examples

### List operations and sessions

Discover session-related operations with `opencode_operations`:

```json
{
  "filter": "session"
}
```

Then call a native operation through `opencode_request`:

```json
{
  "operation": "session.list"
}
```

The generic call is equivalent to calling `opencode_session_list` with `{}`. Results are native payloads; when scope is configured, project and session lists are filtered to allowed workspaces.

### Steer or queue a prompt

Call `opencode_session_prompt` with:

```json
{
  "path": {
    "sessionID": "ses_example"
  },
  "body": {
    "text": "Please also run the focused tests.",
    "delivery": "steer"
  }
}
```

`steer` asks the running session to accept the message; `queue` schedules it. The call returns the native admission receipt, not proof that the model started or finished the work. The current agent and model stay unchanged unless you switch them with the native operations.

### Read grouped history

Call `opencode_history` with:

```json
{
  "sessionID": "ses_example",
  "limit": 50
}
```

Each user prompt is grouped with the assistant steps and tool payloads that follow it:

```json
{
  "groups": [
    {
      "user": { "...": "native user message" },
      "steps": [{ "...": "native assistant or tool message" }],
      "terminal": null
    }
  ],
  "cursor": { "next": "..." },
  "beginsMidGroup": false,
  "endsMidGroup": true
}
```

`terminal` is set when the group has an idle marker. `beginsMidGroup` or `endsMidGroup` is true when a page starts or ends partway through a group. Continue with the returned native cursor; when it is an object, pass `cursor.next` as the next `cursor` argument.

### Read live or logged events

Call `opencode_events` for a bounded live look at one session:

```json
{
  "sessionID": "ses_example",
  "source": "live",
  "types": ["session.idle"],
  "durationMs": 5000
}
```

`live` reads the volatile global stream, filters by session, and cannot replay events missed before the call. It does not accept an `after` cursor.

For the native per-session log, use `source: "log"` and a cursor:

```json
{
  "sessionID": "ses_example",
  "source": "log",
  "after": 42,
  "limit": 50
}
```

If `source` is omitted and `after` is present, the call uses the log. A log cursor is not valid for the global stream. Depending on the upstream version, the log may retain only a synchronization marker, so it is not a guaranteed full history replay. Streams are bounded by `limit` (1–200), `durationMs` (100–30000), and response size.

## TypeScript SDK

```ts
import { OpenCodeClient } from "@nones/opencode-mcp";

const client = await OpenCodeClient.connect();
const info = await client.request({ operation: "server.info" });
```

## Upstream behavior

- The initial target is OpenCode 2.4.1. Operation IDs, parameters, and experimental surfaces come from the connected server's `/openapi.json`; inspect `opencode_operations` rather than assuming a catalog entry exists.
- Installed OpenCode's experimental surfaces are exposed as-is. Unsupported upstream operations are not emulated.
- Session creation supports the native `parentID` body field when available. Parent linkage is never synthesized.
- `event.subscribe` and `experimental.session.log` are not available as direct operations; use `opencode_events`.
- The server never starts, restarts, replaces, or implicitly creates an OpenCode service, and it does not proxy credential, authorization, pairing, or RPC tunnel routes.

## Development

Bun is the build and test runner; the published CLI runs on Node 22.14 or newer. Run `bun install --frozen-lockfile`, `bun run lint`, `bun run typecheck`, `bun run build`, `bun test`, and `npm pack --dry-run`. See [CONTRIBUTING.md](CONTRIBUTING.md) for architecture, testing, and review guidance.
