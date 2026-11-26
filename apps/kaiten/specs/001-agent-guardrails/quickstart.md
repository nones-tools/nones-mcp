# Quickstart Validation: Agent Guardrails & Server Modes (v3.4.0)

How to prove the feature works end-to-end. No network or credentials needed for the
automated part; the manual part needs a real Kaiten instance.

## Prerequisites

```bash
bun install
```

## Automated gates (must all pass)

```bash
bun test             # includes the new guardrail suites (see plan.md test layout)
bunx tsc --noEmit
bun run lint
```

Key suites to eyeball in the output:

- `config-guardrails` — parsing, precedence, malformed-value tolerance
- `http-readonly-gate`, `http-timeout-retry` — client-layer gates
- `services-guard-scope`, `services-cards-filter` — scope matrix & listing filters
- `mcp-disabled-tools`, `mcp-cards-limit` — adapter-layer behavior
- `mcp-tools` — frozen tool order/contract regression stays green

## Manual smoke (optional, real Kaiten)

1. **Read-only**: in the MCP client config add `"KAITEN_READ_ONLY": "true"` to the
   server's `env`; ask the agent to add a comment to any card → expect an error
   naming `KAITEN_READ_ONLY`; ask it to list cards → works.
2. **Column allowlist**: set `KAITEN_ALLOWED_COLUMN_IDS=<one column id>`; ask for the
   board's cards → only that column's cards; ask to move a card to another column →
   rejection naming the variable.
3. **Protected column**: set `KAITEN_PROTECTED_COLUMN_IDS=<Done column id>`; ask to
   move a card to Done → rejected; ask to read cards in Done → works.
4. **Enforce scope**: set `KAITEN_ENFORCE_SCOPE=true` + `KAITEN_DEFAULT_BOARD_ID`;
   ask about a card from another board → rejection naming the enforced scope.
5. **Tool hiding**: set `KAITEN_DISABLED_TOOLS=kaiten_delete_card,kaiten_move_card`;
   restart the client → both tools absent from the tool list.
6. **Cards limit**: set `KAITEN_CARDS_LIMIT=5` on a busy board → 5 cards + a
   `truncated: true` wrapper with the real total.
7. **Timeout**: set `KAITEN_HTTP_TIMEOUT_MS=1` → every call fails fast with a
   timeout error naming the variable; remove it → normal again.

## Expected documentation state

- `docs/configuration.md` lists every new variable with the guardrails-vs-token-permissions caveat.
- `CHANGELOG.md` `## Unreleased` describes the feature set (rolled into 3.4.0 by the release flow).
- Constitution shows the 1.3.0 amendment note (required→optional relaxation is additive).
