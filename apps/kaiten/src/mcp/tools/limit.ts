/**
 * US6 (specs/001-agent-guardrails): `KAITEN_CARDS_LIMIT` caps how many cards
 * any listing/search tool returns, with an explicit truncation indicator so
 * agents don't mistake a capped result for the full board. Adapter-layer
 * only (research.md §R7) - SDK/CLI callers are unaffected, so this stays a
 * small dependency-free helper used only by `tools/cards.ts`.
 */

export interface TruncatedList<T> {
  truncated: true;
  total: number;
  returned: number;
  note: string;
  cards: T[];
}

/**
 * Returns `cards` untouched when `limit` is not set or not exceeded (same
 * reference, so existing consumers iterating a plain array see no change).
 * Otherwise returns a wrapper naming the total available count and the
 * variable responsible, suggesting narrower `boardId`/`columnId` filters.
 */
export function applyCardsLimit<T>(cards: T[], limit: number | null | undefined): T[] | TruncatedList<T> {
  if (!limit || cards.length <= limit) return cards;
  return {
    truncated: true,
    total: cards.length,
    returned: limit,
    note:
      `List truncated to ${limit} of ${cards.length} cards by KAITEN_CARDS_LIMIT - ` +
      'narrow the results with boardId/columnId filters to see more.',
    cards: cards.slice(0, limit),
  };
}
