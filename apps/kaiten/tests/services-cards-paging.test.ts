import { describe, expect, it, mock } from 'bun:test';
import type { Card, CardListOptions, KaitenApiPort, KaitenConfig } from '@/kaiten';
import { AccessGuard, CardService, MAX_PAGES, PAGE_SIZE } from '@/services';

type Config = Pick<
  KaitenConfig,
  | 'defaultSpaceId'
  | 'defaultBoardId'
  | 'allowedSpaceIds'
  | 'allowedBoardIds'
  | 'allowedColumnIds'
  | 'allowedLaneIds'
  | 'protectedColumnIds'
  | 'enforceScope'
  | 'defaultColumnId'
  | 'defaultLaneId'
>;

const CONFIG: Config = {
  defaultSpaceId: null,
  defaultBoardId: null,
  allowedSpaceIds: null,
  allowedBoardIds: null,
  allowedColumnIds: null,
  allowedLaneIds: null,
  protectedColumnIds: null,
  enforceScope: false,
  defaultColumnId: null,
  defaultLaneId: null,
};

function card(id: number): Card {
  return { id, title: `card ${id}`, board_id: 1, column_id: 1, lane_id: null } as Card;
}

/** CardService wired to a getCards mock that serves `total` cards page by page, honoring limit/offset. */
function makePagedService(total: number) {
  const all = Array.from({ length: total }, (_, i) => card(i + 1));
  const getCardsMock = mock(async (_spaceId: number, _boardId: number | null, opts: CardListOptions) =>
    all.slice(opts.offset ?? 0, (opts.offset ?? 0) + (opts.limit ?? PAGE_SIZE))
  );
  const api = { cards: { getCards: getCardsMock } } as unknown as KaitenApiPort;
  const guard = new AccessGuard(api, CONFIG as KaitenConfig);
  return { service: new CardService(api, guard, CONFIG as KaitenConfig), getCardsMock };
}

describe('CardService.getCards - auto-pagination (kaiten-mcp-3mh)', () => {
  it('default limit stays a single 100-card request, condition 1, updated desc', async () => {
    const { service, getCardsMock } = makePagedService(250);
    const result = (await service.getCards(5)) as Card[];
    expect(result).toHaveLength(100);
    expect(getCardsMock).toHaveBeenCalledTimes(1);
    expect(getCardsMock.mock.calls[0]![2]).toEqual({ condition: 1, limit: 100, offset: 0, orderBy: 'updated', orderDirection: 'desc' });
  });

  it('limit above the server page cap pages sequentially: 250 -> 100+100+50', async () => {
    const { service, getCardsMock } = makePagedService(1000);
    const result = (await service.getCards(5, null, false, { limit: 250 })) as Card[];
    expect(result).toHaveLength(250);
    expect(result[0]!.id).toBe(1);
    expect(result[249]!.id).toBe(250);
    const pages = getCardsMock.mock.calls.map((c) => ({ limit: (c[2] as CardListOptions).limit, offset: (c[2] as CardListOptions).offset }));
    expect(pages).toEqual([
      { limit: 100, offset: 0 },
      { limit: 100, offset: 100 },
      { limit: 50, offset: 200 },
    ]);
  });

  it('a short page ends pagination early instead of requesting the full budget', async () => {
    const { service, getCardsMock } = makePagedService(130);
    const result = (await service.getCards(5, null, false, { limit: 500 })) as Card[];
    expect(result).toHaveLength(130);
    expect(getCardsMock).toHaveBeenCalledTimes(2);
  });

  it('an explicit offset shifts every page window', async () => {
    const { service, getCardsMock } = makePagedService(1000);
    const result = (await service.getCards(5, null, false, { limit: 150, offset: 40 })) as Card[];
    expect(result[0]!.id).toBe(41);
    expect(result).toHaveLength(150);
    const offsets = getCardsMock.mock.calls.map((c) => (c[2] as CardListOptions).offset);
    expect(offsets).toEqual([40, 140]);
  });

  it('explicit condition/orderBy/orderDirection pass through unchanged', async () => {
    const { service, getCardsMock } = makePagedService(10);
    await service.getCards(5, null, false, { condition: 2, orderBy: 'created', orderDirection: 'asc' });
    expect(getCardsMock.mock.calls[0]![2]).toEqual({ condition: 2, limit: 100, offset: 0, orderBy: 'created', orderDirection: 'asc' });
  });

  it('MAX_PAGES caps a runaway limit even when the server keeps returning full pages', async () => {
    const getCardsMock = mock(async (_s: number, _b: number | null, opts: CardListOptions) =>
      Array.from({ length: opts.limit ?? PAGE_SIZE }, (_, i) => card((opts.offset ?? 0) + i + 1))
    );
    const api = { cards: { getCards: getCardsMock } } as unknown as KaitenApiPort;
    const guard = new AccessGuard(api, CONFIG as KaitenConfig);
    const service = new CardService(api, guard, CONFIG as KaitenConfig);
    const result = (await service.getCards(5, null, false, { limit: 10_000 })) as Card[];
    expect(result).toHaveLength(MAX_PAGES * PAGE_SIZE);
    expect(getCardsMock).toHaveBeenCalledTimes(MAX_PAGES);
  });
});
