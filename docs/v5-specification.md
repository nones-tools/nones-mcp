# Nones MCP 5.0.0

## Core and integrations

`@nones/mcp-core` supplies a public command and tool registry, CLI binding, stdio server construction, dispatch lifecycle, and journal. Integrations supply typed command definitions, schemas, explicit tool exposure, domain clients, and permissions. Kaiten and OpenCode keep their CLI entry points, package exports, and existing MCP names and schemas.

The acceptance example is a third-party package that uses the same typed handler from a CLI command and an explicitly exposed tool. It runs with Node and Bun. Kaiten and OpenCode standalone servers and the aggregate entry use the same dispatch and journaling policies.

## Journal

Each recognized command or MCP tool invocation produces one operation record. The record identifies the integration and invocation surface and includes timestamps, duration, and outcome. Successful calls, errors, and cancellations receive distinct outcomes. Discovery, help, version, and journal inspection skip recording. OpenCode CLI session identifiers, titles, and the existing configurable prompt policy remain compatible.

MCP tool records contain metadata by default. The core mediates adapter creation, record delivery, and diagnostics. Adapter failures preserve native outcomes. The default SQLite adapter reads the existing database and schema. It is exported as `@nones/journal/sqlite` from the adapter collection in `adapters/journal`. A barrel in `src/sqlite/index.ts` defines the typed public subpath. Adapters can be added through sibling subpaths. A trusted installed adapter can implement the same versioned contract. Shared configuration lives in `~/.config/nones` or the configured XDG directory.

End-to-end tests cover both standalone providers and the aggregate entry. Fixtures exercise the SQLite database and an alternate adapter, schema parity, duplicate prevention, cancellation, and scoped credentials.

## Versions and deployment

The root and four workspace manifests advance together. The public package names are `@nones/mcp-core`, `@nones/kaiten-mcp`, `@nones/opencode-mcp`, and `@nones/journal`. The coordinated release starts at 5.0.0.

A root version command synchronizes the manifests and lockfile. A single `vX.Y.Z` tag validates the exact commit and tag alignment, builds and verifies the workspaces, and packs a four-package release. A fresh install from the verified artifacts checks the public entry points. Publication stages all four versions in dependency order. Promotion of `latest` follows registry confirmation of the complete set. A rerun verifies digests and resumes partial publication while preserving newer releases.

GitHub Actions publishes from the monorepo through npm Trusted Publishing. Initial registry bootstrap can use the identical verified archives and an authorized npm session. The same workflow archives all four tarballs and their checksums in GitHub Releases.

## GitHub and project identity

The two original repository tips remain in `legacy/kaiten-master` and `legacy/opencode-main`. Both histories are ancestors of the monorepo's `main` branch. New work builds on that combined history. The original repositories preserve their releases, documentation, and links to the canonical source.

The organization's public profile links the monorepo and the historical repositories. The monorepo, Kaiten MCP, and OpenCode MCP use a common banner style and the organization's pixel octopus.
