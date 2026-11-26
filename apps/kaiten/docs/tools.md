# MCP tools

58 tools, grouped by domain. All responses are JSON in a text content block.

Tools also carry MCP annotations (`readOnlyHint`, `destructiveHint`) so clients can render or
gate them appropriately — see [Annotations](#annotations) below.

Tools backed by an HTTP DELETE call are also gated behind `KAITEN_API_DELETE_ALLOW=true` — see
[Destructive operations](../README.md#destructive-operations). They're marked "Requires
`KAITEN_API_DELETE_ALLOW=true`" below.

## Navigation

| Tool | Params | Notes |
| --- | --- | --- |
| `kaiten_spaces` | — | Filtered by `KAITEN_ALLOWED_SPACE_IDS` when set. Read-only. |
| `kaiten_boards` | `spaceId?` | Defaults to `KAITEN_DEFAULT_SPACE_ID`. Read-only. |
| `kaiten_columns` | `boardId` | Read-only. |
| `kaiten_lanes` | `boardId` | Lists lanes on a board — use to discover `laneId` for `kaiten_create_card` / `kaiten_move_card`. Read-only. |

## Cards

| Tool | Params | Notes |
| --- | --- | --- |
| `kaiten_cards` | `spaceId?`, `boardId?`, `minimal?`, `condition?`, `limit?`, `offset?`, `orderBy?`, `orderDirection?` | Since 4.1.0 defaults to **active cards only, newest-updated first** (`condition: 1`, `orderBy: 'updated'`, `orderDirection: 'desc'`) — pass `condition: 2` for archived or `'all'` for both. `limit` defaults to 100; values up to 1000 are fetched in sequential pages of 100 automatically; `offset` pages manually. `minimal: true` → token-optimized projection, or defaults to minimal when `KAITEN_MINIMAL_DEFAULT=true` (explicit `minimal` still wins). Filtered by `KAITEN_ALLOWED_BOARD_IDS`/`KAITEN_ALLOWED_COLUMN_IDS`/`KAITEN_ALLOWED_LANE_IDS` when set; scoped to `KAITEN_DEFAULT_BOARD_ID` when no `boardId` is passed. May return a truncated-list wrapper (`{ truncated, total, returned, note, cards }`) instead of a plain array when `KAITEN_CARDS_LIMIT` is set and exceeded. Read-only. |
| `kaiten_card` | `cardId`, `simple?` | `simple` defaults to **true** (compact); pass `false` for the full payload. Read-only. |
| `kaiten_create_card` | `title`, `boardId`, `columnId?`, `description?`, `laneId?`, `tags?`, `size?`, `plannedStart?`, `plannedEnd?`, `typeId?` | `columnId` is optional when `KAITEN_DEFAULT_COLUMN_ID` is configured server-side (3.4.0 relaxation — explicit argument always wins; an actionable error is thrown if neither is set); otherwise required. Specify `laneId` when known (discover via `kaiten_lanes`) — otherwise the card lands on `KAITEN_DEFAULT_LANE_ID` if configured, else the board's default lane. `typeId` discoverable via `kaiten_card_types`. |
| `kaiten_update_card` | `cardId`, plus optional structured fields: `title`, `description`, `columnId`, `laneId`, `boardId`, `size`, `plannedStart`, `plannedEnd`, `dueDate`, `asap`, `condition`; legacy `data?` | Prefer the structured fields. `data` (JSON **string**) is **deprecated**, kept only for raw Kaiten fields not yet modeled — explicit structured fields win over the same key in `data`. At least one field is required. |
| `kaiten_delete_card` | `cardId` | Destructive. Requires `KAITEN_API_DELETE_ALLOW=true`. |
| `kaiten_move_card` | `cardId`, `columnId`, `laneId?` | Validates the column belongs to the card's board; error lists available columns. `laneId` discoverable via `kaiten_lanes`. |
| `kaiten_assign_card` | `cardId`, `userId` | |
| `kaiten_unassign_card` | `cardId`, `userId` | Remove a user assignment |
| `kaiten_archive_card` | `cardId` | Sets `condition` to archived |
| `kaiten_unarchive_card` | `cardId` | Sets `condition` back to active |
| `kaiten_find_cards` | `tagName`, `boardId?` | Returns only `id`, `title`, `board_id`, `column_id`, `tags`. Filtered by `KAITEN_ALLOWED_BOARD_IDS` when set. May return the same truncated-list wrapper as `kaiten_cards` when `KAITEN_CARDS_LIMIT` is set and exceeded. Read-only. |
| `kaiten_find_cards_by_tag` | `tagName`, `boardId?` | Clearly named additive alias of `kaiten_find_cards`; both use exact tag matching. |
| `kaiten_health` | — | Local, read-only diagnostics: version, cwd, configuration presence/source, normalized URL origin and readiness. Never contacts Kaiten or returns secrets. |

## Card hierarchy

| Tool | Params | Notes |
| --- | --- | --- |
| `kaiten_create_child_card` | `parentId`, `title` | |
| `kaiten_get_child_cards` | `cardId` (one level) | Read-only. |
| `kaiten_get_all_child_cards` | `cardId` (recursive) | Read-only. |
| `kaiten_get_parent` | `cardId` | Read-only. |
| `kaiten_attach_to_parent` | `cardId`, `parentId`, `position?` | |
| `kaiten_detach_from_parent` | `cardId` | Destructive. Requires `KAITEN_API_DELETE_ALLOW=true`. |

## Comments & tags

| Tool | Params | Notes |
| --- | --- | --- |
| `kaiten_add_comment` | `cardId`, `text` | |
| `kaiten_get_comments` | `cardId` | Read-only. |
| `kaiten_update_comment` | `commentId`, `text` | |
| `kaiten_delete_comment` | `commentId` | Destructive. Requires `KAITEN_API_DELETE_ALLOW=true`. |
| `kaiten_add_tag` | `cardId`, `tagName` | |
| `kaiten_remove_tag` | `cardId`, `tagName` | Destructive. Requires `KAITEN_API_DELETE_ALLOW=true`. |

## Checklists

| Tool | Params | Notes |
| --- | --- | --- |
| `kaiten_get_checklists` | `cardId` | Read-only. |
| `kaiten_create_checklist` | `cardId`, `name` | |
| `kaiten_update_checklist` | `cardId`, `checklistId`, `name` | |
| `kaiten_delete_checklist` | `cardId`, `checklistId` | Destructive. Requires `KAITEN_API_DELETE_ALLOW=true`. |
| `kaiten_add_checklist_item` | `cardId`, `checklistId`, `text` | |
| `kaiten_toggle_checklist_item` | `cardId`, `checklistId`, `itemId`, `checked` | |
| `kaiten_delete_checklist_item` | `cardId`, `checklistId`, `itemId` | Destructive. Requires `KAITEN_API_DELETE_ALLOW=true`. |

## Files

| Tool | Params | Notes |
| --- | --- | --- |
| `kaiten_get_files` | `cardId` | Read-only. |
| `kaiten_download_file` | `cardId`, `fileId`, `outputDir?` | Default dir `/tmp/kaiten/{cardId}/` |
| `kaiten_download_all_files` | `cardId`, `outputDir?` | |
| `kaiten_clean_temp` | `dir?` | Cleans `/tmp/kaiten/…`. Destructive. |
| `kaiten_attach_file` | `cardId`, `filePath`, `fileName?` | Reads a local file and uploads it as a multipart attachment. `fileName` defaults to the basename of `filePath`. |

## Users

| Tool | Params | Notes |
| --- | --- | --- |
| `kaiten_users` | — | Read-only. |
| `kaiten_search_users` | `query` | Read-only. |
| `kaiten_current_user` | — | The user owning the configured API token. Read-only. |

## Time logs

| Tool | Params | Notes |
| --- | --- | --- |
| `kaiten_get_time_logs` | `cardId` | Read-only. |
| `kaiten_add_time_log` | `cardId`, `timeSpent`, `forDate`, `roleId`, `comment?` | `timeSpent` in minutes, `forDate` is `YYYY-MM-DD`. |

## Card blockers

| Tool | Params | Notes |
| --- | --- | --- |
| `kaiten_get_blockers` | `cardId` | Read-only. |
| `kaiten_block_card` | `cardId`, `reason?`, `blockerCardId?` | |
| `kaiten_unblock_card` | `cardId`, `blockerId` | Destructive. Requires `KAITEN_API_DELETE_ALLOW=true`. |

## External links

Useful for attaching PR/issue URLs to a card.

| Tool | Params | Notes |
| --- | --- | --- |
| `kaiten_get_external_links` | `cardId` | Read-only. |
| `kaiten_add_external_link` | `cardId`, `url`, `description?` | |
| `kaiten_remove_external_link` | `cardId`, `linkId` | Destructive. Requires `KAITEN_API_DELETE_ALLOW=true`. |

## Company dictionaries

| Tool | Params | Notes |
| --- | --- | --- |
| `kaiten_tags` | `query?`, `spaceId?` | List/search company tags. Read-only. |
| `kaiten_card_types` | — | Use the returned `id` as `typeId` for `kaiten_create_card`. Read-only. |
| `kaiten_custom_properties` | — | Custom field definitions. Values are set on cards via `kaiten_update_card`'s legacy `data` with `{"properties": {"id_<propertyId>": value}}`. Read-only. |

## Git

Card-scoped git helpers operating on the current working directory
(branch naming: `feature/{cardId}-{slugified-title}`, commits: `[{cardId}] message`).

| Tool | Params | Notes |
| --- | --- | --- |
| `kaiten_git_branch` | `cardId` | |
| `kaiten_git_checkout` | `cardId` | |
| `kaiten_git_commit` | `cardId`, `message?` | |
| `kaiten_git_status` | — | Read-only. |
| `kaiten_git_push` | `cardId` | |

## Annotations

Every tool registration carries optional MCP `annotations` (`readOnlyHint`, `destructiveHint`)
so clients can render or gate calls appropriately (e.g. skip a confirmation prompt for a
read-only tool, warn before a destructive one). Tools without an annotation noted above
default to neither hint set — treat them as ordinary mutations.

## Tool order

The registry order is a frozen contract for the first 39 tools (navigation → cards → comments
→ hierarchy → tags → git → users → checklists → files, matching the pre-3.0 hand-rolled
server). 3.1.0 appended 6 new tools at the end of the list — `kaiten_lanes`,
`kaiten_update_comment`, `kaiten_delete_comment`, `kaiten_archive_card`, `kaiten_unarchive_card`,
`kaiten_unassign_card` — without reordering or renaming anything that came before. 3.2.0
appended 13 more at the end — `kaiten_current_user`, `kaiten_tags`, `kaiten_card_types`,
`kaiten_custom_properties`, `kaiten_get_time_logs`, `kaiten_add_time_log`,
`kaiten_get_blockers`, `kaiten_block_card`, `kaiten_unblock_card`, `kaiten_get_external_links`,
`kaiten_add_external_link`, `kaiten_remove_external_link`, `kaiten_attach_file`. New tools are
always appended, never interleaved, in future releases too.
