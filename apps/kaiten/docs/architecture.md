# Architecture

Three delivery surfaces (MCP server, CLI, SDK) over one core, in strict layers —
dependencies point inward only:

```
┌────────────────────────────── adapters ─────────────────────────────┐
│  src/mcp/   tools/ (58 tools by domain) + hooks/ (middleware chain) │
│  src/cli/   commands/ registry + projections + help                 │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ calls only the facade
┌──────────────────────────────▼──────────────────────────────────────┐
│  src/sdk.ts        KaitenSDK — facade, the package's public API     │
│  src/services/     AccessGuard (allowlists), projections,           │
│                    domain services (cards, hierarchy, tags, …)      │
│  src/lib/          git + temp-dir helpers (not Kaiten API)          │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ depends only on the core
┌──────────────────────────────▼──────────────────────────────────────┐
│  src/kaiten/       KAITEN CORE (future @nones/kaiten-core)          │
│    interfaces/     entity types (Card, Board, Column, User, …)      │
│    http/           KaitenClient (fetch adapter) + KaitenApiError    │
│    api/            resource classes → KaitenApi aggregate           │
│    config.ts       loadConfig / parseEnvFile                        │
└─────────────────────────────────────────────────────────────────────┘
```

## Patterns in use

- **Facade** — `KaitenSDK` composes the core client, `AccessGuard` and domain services;
  every public method is a thin delegation. Adapters never bypass it.
- **Adapter** — `KaitenClient` adapts native `fetch` to a typed `HttpTransport`
  interface; API resources depend on the interface, which is how tests inject a fake
  transport (no network in the suite).
- **Chain of responsibility** — MCP tool calls run through a middleware chain
  (`src/mcp/hooks/`): logging → error formatting → handler. Error formatting produces
  the exact `Tool <name> failed: …` contract, including HTTP status/body for
  `KaitenApiError` and the actionable missing-config guidance.
- **Command registry** — CLI commands are self-contained objects dispatched by name;
  adding a command touches one file plus the registry.

## Dependency injection

`src/di/` is the composition root, NestJS/Angular-style, built on `inversify`:

- **`tokens.ts`** — a typed `TOKENS` object of `Symbol`s (`TOKENS.CardService`,
  `TOKENS.KaitenApi`, `TOKENS.KaitenSDK`, …), one per bound dependency.
- **`container.ts`** — `buildContainer(overrides?)` wires everything into a fresh
  `Container` in singleton scope. `overrides` mirrors `KaitenSDKOptions`: config
  overrides plus an optional injected `client` (how tests avoid the network).
- **Core stays framework-free** — `KaitenClient`/`KaitenApi` are bound with factory
  bindings (`toDynamicValue`); nothing under `src/kaiten/` imports `inversify` or
  carries a decorator, preserving Principle III (future `@nones/kaiten-core` extraction).
- **App-layer services are decorated** — every class in `src/services/` is
  `@injectable()` with constructor params resolved via `@inject(TOKENS.X)`, and is
  typed against `KaitenApiPort`/`HttpTransport` (see `src/kaiten/interfaces/ports.ts`),
  never the concrete `KaitenApi`/`KaitenClient` classes.
- **`KaitenSDK` is unaffected from the outside** — its constructor still takes
  `KaitenSDKOptions` and builds a container internally, so `new KaitenSDK(options)` /
  `createSDK(options)` keep their exact pre-DI signature and behavior.

## Rules that keep it maintainable (see constitution)

- No source file over **200 lines**; one domain concept per file; layers expose barrels.
- `src/kaiten/` is import-isolated — nothing inside it may import from outside.
  **Standing decision:** it will be extracted into a standalone `@nones/kaiten-core`
  package (beads epic `kaiten-mcp-jtg`), with this repo depending on it.
- stdout is reserved for the MCP protocol; all logs go to stderr.
- Public contracts (tool names/schemas, CLI output, root exports) only change with a
  major version bump.

## Build

`bun build` bundles three entries (`src/index.ts`, `src/cli/index.ts`,
`src/mcp/server.ts`) for the Node target with dependencies external. The package
publishes a single `kaiten` bin (since 4.0.0): the MCP server starts via the `kaiten mcp`
subcommand, which lazily imports the shared `startMcpServer()` bootstrap
(`src/mcp/bootstrap.ts`) so the MCP adapter never loads for ordinary CLI commands;
`dist/mcp/server.js` remains as the internal dev/`bun run start` entry over the same
bootstrap.
`tsc --emitDeclarationOnly` produces the `.d.ts` files. The published artifact contains
only `dist/` + `README.md` and runs on plain Node >= 18.
