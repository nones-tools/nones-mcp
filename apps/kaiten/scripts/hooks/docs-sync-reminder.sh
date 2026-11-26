#!/usr/bin/env bash
# Claude Code PostToolUse hook (matcher: Write|Edit).
# When a public-API source file is edited, injects a reminder into the model
# context to update the user-facing docs in the same change (constitution
# Principle IV: behavior is contract; AGENTS.md: docs/ stays in sync with code).
# Emits nothing for internal files, so it is silent for most edits.
set -euo pipefail

file="$(jq -r '.tool_input.file_path // .tool_response.filePath // empty')"
[ -n "$file" ] || exit 0

case "$file" in
  */src/mcp/tools/* | */src/cli/* | */src/sdk.ts | */src/index.ts | \
  */src/kaiten/config.ts | */src/kaiten/config-parse.ts | \
  */src/kaiten/interfaces/* | */src/kaiten/http/errors.ts | */src/kaiten/http/client.ts)
    jq -n --arg f "$file" '{
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: ("Public-API file edited: " + $f + ". If this change affects the user-facing surface (MCP tool names/schemas/defaults, CLI output, root exports, error messages, env variables), update the documentation IN THE SAME change: docs/tools.md / docs/cli.md / docs/sdk.md / docs/configuration.md, README.md, plus a CHANGELOG.md \"## Unreleased\" entry. If the edit is internal-only, no doc update is needed.")
      }
    }'
    ;;
esac
exit 0
