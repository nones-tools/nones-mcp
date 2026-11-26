# OpenCode MCP

Local MCP server, Node CLI and TypeScript SDK for an **already running** OpenCode 2 service. Initial target: OpenCode 2.4.1. Node 22.14 or newer is required. The server never starts or restarts OpenCode. It connects to the existing managed service using the official service discovery and authentication adapter.

## Install

```sh
npm install -g @nones/opencode-mcp
opencode-mcp doctor
```

Codex (`~/.codex/config.toml`):

```toml
[mcp_servers.opencode]
command = "opencode-mcp"
args = ["mcp"]
```

Claude and other stdio clients:

```json
{"mcpServers":{"opencode":{"command":"opencode-mcp","args":["mcp"]}}}
```

Local CLI: `opencode-mcp mcp`, `opencode-mcp doctor`, `opencode-mcp help`. Stdout is reserved for MCP protocol traffic in server mode. Discovery may use `OPENCODE_MCP_SERVICE_FILE` as the path to an OpenCode-managed service registration. Never put passwords in command arguments or configuration committed to source control.

## Connection and safety

Set `OPENCODE_MCP_URL` to override discovery. An explicit authenticated endpoint uses `OPENCODE_MCP_PASSWORD` for Basic user `opencode`. Remote hosts require HTTPS and `OPENCODE_MCP_ALLOW_REMOTE=1`. Redirects are disabled; `OPENCODE_MCP_TIMEOUT_MS` ranges from 100 to 120000 (default 30000). Values of capability flags must equal `1` exactly:

- `OPENCODE_MCP_ALLOW_DESTRUCTIVE=1` and `confirm: true`: deletion, filesystem writes, and rollback/commit operations.
- `OPENCODE_MCP_ALLOW_ADMIN=1` and `confirm: true`: plugin updates, global configuration, and other unclassified mutations.
- `OPENCODE_MCP_ALLOW_EXEC=1` and `confirm: true`: explicit shell, command, and PTY operations.

Use `OPENCODE_MCP_ALLOWED_DIRS` as a platform path-delimited list of existing allowed directories. Session operations check the native session location against canonical filesystem paths; session and project lists are filtered. Operations whose scope cannot be verified are rejected. Scoped creation requires an allowed `body.location.directory` and checks any parent session; other unverifiable operations are rejected; use a dedicated service if they are required. This is not a multi-user isolation boundary for the OpenCode server itself.

Do not retry a timed-out mutation without checking its outcome: it may already have completed. Access to credentials, authorization provisioning, pairing and RPC tunnels is excluded. Responses omit sensitive credential fields. MCP clients can see chat content and tool outputs, so attach only trusted clients.

## Tools

`opencode_operations` reports operation IDs, methods, paths, parameter names and safety classes from the connected service's OpenAPI document. `opencode_request` takes `{operation, path?, query?, body?, confirm?}` and dynamically named tools `opencode_<operation_id>` take the same parameters except `operation`. Dots in operation IDs become underscores. For example, `opencode_session_prompt` accepts `{ "path": { "sessionID": "..." }, "body": { "text": "...", "delivery": "steer" } }`. It returns the native admission receipt, not proof of delivery or completion. Existing agent and model remain unchanged unless explicitly switched with the native operations.

`opencode_history` takes `{sessionID, cursor?, limit?}` and groups native messages by user prompt while preserving native assistant/tool payloads. Boundary flags indicate a page may begin or end mid-group. Continue with the native cursor. `opencode_events` accepts `{sessionID?, types?, source?, after?, limit?, durationMs?}`. Source `live` subscribes to the volatile global stream, filters by session and cannot replay missed events. Source `log` uses the native per-session log and `after` cursor; the upstream server may retain only a synchronization marker, so it is not a guaranteed history replay. A log cursor does not apply to the global stream. SSE calls are bounded in time, size and event count.

Session creation supports the native `parentID` body field when available. Native operations may differ across OpenCode versions: inspect the catalog. This project exposes installed OpenCode's experimental surfaces as-is; unsupported upstream operations are not emulated. Skills and plugin read operations use their native catalog entries; plugin administration requires its gate.

```ts
import { OpenCodeClient } from '@nones/opencode-mcp';
const client = await OpenCodeClient.connect();
const info = await client.request({ operation: 'server.info' });
```

## Release

Verification and release workflows use a frozen Bun lockfile. The first npm publish is performed separately by an authorized local npm session; the tag creates a GitHub release but will not publish to npm unless repository variable `NPM_TRUSTED_PUBLISHER_ENABLED` is set to `1` after configuring npm trusted publishing for the release workflow. Never enable it until bootstrap publishing and trust configuration are complete.
