# Changelog

## 0.1.1

Documentation, refactoring, and packaging release.

- Refactored the runtime into classes with shared helpers for connection, catalog, transport, workspace scope, events, history, and tool registration.
- Tool results and `doctor` output now use indented JSON while structured content keeps the native data shape.
- Rewrote the README with quick start, Codex and generic stdio setup, list/steer/history/event examples, and connection safety notes.
- Added CONTRIBUTING.md, CODEOWNERS, pull request and issue templates, and the NONES banner.
- Included CONTRIBUTING.md and the banner in the npm package, bumped the package version, and formatted handwritten JSON config with two spaces.

## 0.1.0

Initial OpenCode MCP server, CLI, and SDK with native operation discovery, grouped history, bounded event streams and central safety gates.
