import type { Card, CardListOptions } from '../kaiten';

/** The server caps a single `GET /cards` page at 100 (developers.kaiten.ru). */
export const PAGE_SIZE = 100;
/** Hard ceiling on auto-pagination (10 pages = 1000 cards) - a runaway `limit` must not turn into an unbounded request storm against a rate-limited API. */
export const MAX_PAGES = 10;

/**
 * Applies the 4.1.0 list defaults (`condition: 1`, `updated` `desc` - the
 * server's own defaults, all conditions oldest-first, made large boards
 * return only ancient archived cards, kaiten-mcp-3mh) and fetches up to
 * `limit` cards through `fetchPage`, sequentially, in server-sized pages.
 * Stops early on a short page; bounded by MAX_PAGES.
 */
export async function collectCardPages(
  options: CardListOptions,
  fetchPage: (pageOptions: CardListOptions) => Promise<Card[]>
): Promise<Card[]> {
  const { condition = 1, limit = PAGE_SIZE, offset = 0, orderBy = 'updated', orderDirection = 'desc' } = options;
  const cards: Card[] = [];
  for (let page = 0; cards.length < limit && page < MAX_PAGES; page++) {
    const pageLimit = Math.min(PAGE_SIZE, limit - cards.length);
    const batch = await fetchPage({ condition, limit: pageLimit, offset: offset + cards.length, orderBy, orderDirection });
    cards.push(...batch);
    if (batch.length < pageLimit) break;
  }
  return cards;
}
