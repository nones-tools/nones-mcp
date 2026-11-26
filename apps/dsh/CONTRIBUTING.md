# Contributing

Thanks for looking. This is a small, focused package: an MCP endpoint for one DeepSeek
Harness instance, plus the settings page that hands out its config. The rules below are
mostly about keeping it that way.

## What this repo is

A **DeepSeek Harness plugin bundle** with two halves:

| Half | Runs in | Entry |
|---|---|---|
| Host | the harness process | `src/index.ts` → `dist/index.js` |
| Client | the Web UI (browser) | `src/client.ts` → `dist/client.js` |

The Host half owns the HTTP listener, the bearer gate, the tools and the config route. The
Client half owns the Settings page. They talk over the authenticated `/api` channel.

## Requirements

- Node ≥ 22.14
- [bun](https://bun.sh) (dependency install, scripts)
- A DeepSeek Harness installation to try the plugin in (optional for the smoke test)

## Quick start

This app lives in the `nones-mcp` monorepo; build and test it from the workspace
root so the shared `@nones/mcp-core` and `@nones/journal` sources are current.

```bash
git clone https://github.com/nones-tools/nones-mcp.git
cd nones-mcp
bun install --frozen-lockfile
bun run build                 # core, journal, both apps and this bundle
bun run --cwd apps/dsh typecheck
bun run --cwd apps/dsh test   # smoke test, no harness needed
```

`dist/` is generated and ignored. The packed tarball contains only compiled
entry points, the Cordis patch, locale files and the icon; it never contains
`src/`.

## Layout

```
src/index.ts     Cordis plugin: bearer, listener, state file, config route
src/server.ts    node:http listener + bearer gate + core createToolServer
src/tools.ts     the tool surface in a core registry, backed by ctx.sessionController
src/log.ts       bounded last-five observer for the Settings page
src/config.ts    token persistence, snippets, payload types
src/client.ts    the Settings page (classic script)
src/types.ts     the structural slice of Harness types we depend on
test/smoke.mjs   endpoint + every tool + core journal, against a stub controller
```

### Why two tsconfigs

`tsconfig.json` builds the Node half. `tsconfig.client.json` builds only `src/client.ts`
with `verbatimModuleSyntax: false`, because the Web shell loads that file as a **classic
script** through `window.__ModuleLoader__`. A single config emits `export {}` at the end,
which is a syntax error in a classic script. If you add another Client file, add it to the
second config's `include` and to `package.json` `exports`.

## Trying it in a harness

```bash
dsh plugin --profile desktop add /absolute/path/to/nones-mcp/apps/dsh
```

Then:

- **Host half** — live immediately. The endpoint starts, the state file is written, the
  config route answers. `$DSH_HOME/state/dsh-session-mcp.json` has the URL and token.
- **Client half** — needs a **full harness restart**. The browser module roster is composed
  from the packages present at boot, and the manifest resolution is cached for the life of
  the process. Reloading the window is not enough.

Useful checks while iterating:

```bash
# endpoint up? (401 without the token is the healthy answer)
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:7801/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# what the Settings page would render
cat "$DSH_HOME/state/dsh-session-mcp.json"
```

To remove it again: `plugin_manager` `remove_bundle`, or `dsh plugin --profile desktop remove`.

## Adding a tool

1. Add the method you need to `SessionController` in `src/types.ts` (structural types only —
   do not import Harness packages, this package must stay installable on its own).
2. Register it in `src/tools.ts` inside `registerTools`, wrapped in `tracked('<name>', …)`
   so the Settings journal records it. Pass `true` as the third `tracked` argument when the
   addressed conversation comes from the **result** rather than the arguments
   (`session_create` does this).
3. Return `ok(value)` on success and `fail(error)` on failure — never throw past the
   handler, and never return an error without `isError`.
4. Add the tool to `EXPECTED_TOOLS` and to the `calls` table in `test/smoke.mjs`. The smoke
   also covers bearer rotation (the listener reads the token per request) — keep that
   property if you touch `src/server.ts`.
5. Add the stub method to the smoke controller.
6. Document it in the README tools tables.
7. `bun run typecheck && bun run test && bun run build`, commit `dist/`.

Keep descriptions written for a model: what the tool does, when to call it, what it costs.

## Changing the Settings page

The page registers into the `settings.section` slot (list; options `{ id, order, label }`)
and renders inside the settings content column. Conventions:

- Text goes through the Client locale service: register `en` and `ru` dictionaries with
  `ctx.locale.register(NS, locale, dict)` and translate with `ctx.locale.bind(NS)`. Both
  dictionaries must carry the same keys.
- Colors come from theme tokens (`--dsw-alias-*`), never hardcoded.
- Everything the page shows arrives from `/api/dsh-session-mcp/config`; the two mutations use
  `/api/dsh-session-mcp/port` and `/api/dsh-session-mcp/token`. Keep the surface at those
  three routes.
- Clean up subscriptions and timers in the effect's cleanup function.
- Destructive actions (token rotation) confirm inline, in two steps — never a browser
  `confirm()`.

## Commit and pull request

- Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, `ci:`.
- One logical change per commit; `chore(release): x.y.z` for the version bump.
- A pull request should say what changed, why, and what you verified. `bun run verify`
  must pass and `dist/` must not be committed.
- The smoke test is the contract. If you change a tool's behaviour, change its assertion.

## Releasing

Publishing is automated by the root monorepo workflow. Never run `npm publish` by
hand and never add a package-local release workflow.

```bash
node scripts/release.mjs version 5.1.0 --write
bun run verify
node --test scripts/release.test.mjs
```

The universal `v5.1.0` tag builds, attests, publishes and releases all five public
packages from one commit. It needs the repository variable
`NPM_TRUSTED_PUBLISHER_ENABLED=1` before npm publication is enabled.

## Gotchas

- **`bun publish` does not work here.** It goes through npm's staged publishing, which
  leaves a `0.0.0-stage` placeholder and rejects the real version until approved. The
  workflow uses `npm publish --provenance` for that reason.
- **The Client half needs a restart**, not a window reload (see above).
- **`git push` can hang** on machines where `credential.helper=osxkeychain` waits for a
  Keychain prompt that never appears. Work around it with an explicit token:
  `git -c credential.helper= -c "url.https://x-access-token:$(gh auth token)@github.com/.insteadOf=https://github.com/" push`.
- **npm granular tokens cannot unpublish or deprecate-over-2FA.** Plan versions accordingly.
- **The endpoint is loopback-only and bearer-authenticated by design.** Do not add a proxy,
  tunnel, or "convenience" no-auth mode.
