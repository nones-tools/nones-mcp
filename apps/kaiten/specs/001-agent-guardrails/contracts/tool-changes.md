# Contract: MCP Tool Surface Deltas (v3.4.0)

Frozen contract rules (constitution IV): no renames, no removals, no reordering, no
type changes, no new required params. This release's deltas:

## Schema changes (additive relaxation)

| Tool | Change | Justification |
| --- | --- | --- |
| `kaiten_create_card` | `columnId`: required → **optional**; description updated to mention `KAITEN_DEFAULT_COLUMN_ID`. `laneId` description updated to mention `KAITEN_DEFAULT_LANE_ID`. | Every previously valid call behaves identically. Constitution 1.3.0 amendment: the required-ness freeze forbids tightening; relaxation is additive. |

No other tool's schema changes. No new tools in this release. Tool count and relative
order of all existing tools unchanged (a tool may be *absent* only via the operator's
`KAITEN_DISABLED_TOOLS`).

## Behavior changes — only under opt-in variables

| Tool(s) | Variable | New behavior |
| --- | --- | --- |
| `kaiten_cards`, `kaiten_find_cards` | `KAITEN_CARDS_LIMIT` | ≤ N cards; wrapped `{truncated, total, returned, note, cards}` shape **only** when truncated |
| `kaiten_cards` | `KAITEN_MINIMAL_DEFAULT` | minimal projection by default; explicit `minimal` wins |
| all card-listing tools | `KAITEN_ALLOWED_COLUMN_IDS` / `KAITEN_ALLOWED_LANE_IDS` | results filtered |
| all write tools | column/lane/protected/enforce-scope/read-only variables | rejection with self-describing error |
| all tools | `KAITEN_DISABLED_TOOLS` | tool absent from `tools/list` |

## Behavior changes — unconditional (documented gap fixes, FR-001..003)

| Tool(s) | Change |
| --- | --- |
| `kaiten_cards`, `kaiten_find_cards`, tag listing paths | space-wide listing now filters by `KAITEN_ALLOWED_BOARD_IDS` when set (was: leaked all boards of the space) |
| `kaiten_cards` | scopes to `KAITEN_DEFAULT_BOARD_ID` when set and no `boardId` passed (was: ignored) |

Both only change behavior for operators who already set those variables, aligning
reality with the variables' documented promise ("operations outside it are rejected").
Test assertions updated for these carry explicit justification in the commit message.

## SDK root-export deltas (additive)

- `CreateCardInput.columnId` becomes optional (`columnId?: number`).
- New export: `loadConfigLenient()` (same merge/parse as `loadConfig`, no
  required-credentials throw) — used by the MCP server for pre-credential needs
  (`disabledTools`).
- New error classes exported from the core barrel: `KaitenReadOnlyError`,
  `KaitenTimeoutError`.
- `KaitenClientOptions` gains optional `readOnly`, `timeoutMs`, `retries`.

## CLI

No command or output-format changes. CLI inherits guardrails through the SDK
(rejections surface as the same self-describing errors).
