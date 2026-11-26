import type { ToolDef } from '../../interfaces';
import { blockerTools } from './blockers';
import { cardTools, findCardsByTagTool, newCardTools } from './cards';
import { checklistTools } from './checklists';
import { commentTools, newCommentTools, tagTools } from './comments-tags';
import { dictionaryTools } from './dictionaries';
import { fileTools, newFileTools } from './files';
import { gitTools } from './git';
import { hierarchyTools } from './hierarchy';
import { healthTool } from './health';
import { linkTools } from './links';
import { navigationTools, newNavigationTools } from './navigation';
import { timeLogTools } from './timelogs';
import { newUserTools, userTools } from './users';

export type { ToolDef } from '../../interfaces';

/**
 * Full tool registry, concatenated in EXACTLY the order the old monolithic
 * `mcp-server.js`/`mcp/tools.ts` registered them - tests assert this order.
 * The per-domain source files don't all read contiguously in that order
 * (comments/tags/hierarchy interleave), so the order is reconstructed here
 * rather than by file layout.
 *
 * 3.1.0 appended 6 additive tools (kaiten_lanes, kaiten_update_comment,
 * kaiten_delete_comment, kaiten_archive_card, kaiten_unarchive_card,
 * kaiten_unassign_card) after the original 39.
 *
 * 3.2.0 appends 13 more additive tools after those 6, in this exact order:
 * kaiten_current_user, kaiten_tags, kaiten_card_types, kaiten_custom_properties,
 * kaiten_get_time_logs, kaiten_add_time_log, kaiten_get_blockers,
 * kaiten_block_card, kaiten_unblock_card, kaiten_get_external_links,
 * kaiten_add_external_link, kaiten_remove_external_link, kaiten_attach_file.
 * The 45 tools above are untouched - new tools are only ever appended at the
 * end, never interleaved.
 */
export const tools: ToolDef[] = [
  ...navigationTools,
  ...cardTools,
  ...commentTools,
  ...hierarchyTools,
  ...tagTools,
  ...gitTools,
  ...userTools,
  ...checklistTools,
  ...fileTools,
  ...newNavigationTools,
  ...newCommentTools,
  ...newCardTools,
  ...newUserTools,
  ...dictionaryTools,
  ...timeLogTools,
  ...blockerTools,
  ...linkTools,
  ...newFileTools,
  findCardsByTagTool,
];

export { healthTool };

/**
 * US5 (specs/001-agent-guardrails): `KAITEN_DISABLED_TOOLS` hides tools from
 * registration entirely (attack surface + context window). Pure function so
 * it's testable without spinning up the MCP server - `server.ts` is the only
 * caller. Survivors keep the registry's relative order (a plain `.filter`
 * already guarantees that); names in `disabledNames` that match no tool are
 * reported back so the caller can warn without silently ignoring a typo.
 */
export function filterTools(
  allTools: ToolDef[],
  disabledNames: string[] | null | undefined
): { kept: ToolDef[]; unknown: string[] } {
  if (!disabledNames || disabledNames.length === 0) {
    return { kept: allTools, unknown: [] };
  }
  const disabled = new Set(disabledNames);
  const known = new Set(allTools.map((t) => t.name));
  const kept = allTools.filter((t) => !disabled.has(t.name));
  const unknown = disabledNames.filter((name) => !known.has(name));
  return { kept, unknown };
}
