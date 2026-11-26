import { describe, expect, it, mock } from 'bun:test';
import type { Card, KaitenApiPort, KaitenConfig } from '@/kaiten';
import { AccessGuard, CardService, TagService } from '@/services';

/** The 4.1.0 list defaults CardService applies before hitting the API (kaiten-mcp-3mh). */
const DEFAULT_PAGE_OPTIONS = { condition: 1, limit: 100, offset: 0, orderBy: 'updated', orderDirection: 'desc' };

type Config = Pick<
  KaitenConfig,
  | 'defaultSpaceId'
  | 'defaultBoardId'
  | 'allowedSpaceIds'
  | 'allowedBoardIds'
  | 'allowedColumnIds'
  | 'allowedLaneIds'
  | 'enforceScope'
  | 'protectedColumnIds'
  | 'defaultColumnId'
  | 'defaultLaneId'
>;

const DEFAULT_CONFIG: Config = {
  defaultSpaceId: null,
  defaultBoardId: null,
  allowedSpaceIds: null,
  allowedBoardIds: null,
  allowedColumnIds: null,
  allowedLaneIds: null,
  enforceScope: false,
  protectedColumnIds: null,
  defaultColumnId: null,
  defaultLaneId: null,
};

function card(id: number, board_id: number, column_id = 1, lane_id: number | null = null): Card {
  return { id, title: `card ${id}`, board_id, column_id, lane_id } as Card;
}

/** Builds a CardService (+ its real AccessGuard) wired to a mocked KaitenApiPort. */
function makeCardService(overrides: Partial<Config> = {}, cards: Card[] = []) {
  const config: Config = { ...DEFAULT_CONFIG, ...overrides };
  const getCardsMock = mock(async (..._args: unknown[]) => cards);
  const getCardMock = mock(async (id: number) => cards.find((c) => c.id === id) ?? { id, board_id: 1, column_id: 1 });
  const createCardMock = mock(async (data: Record<string, unknown>) => ({ id: 999, ...data }) as unknown as Card);
  const api = {
    cards: { getCards: getCardsMock, getCard: getCardMock, createCard: createCardMock },
  } as unknown as KaitenApiPort;
  const guard = new AccessGuard(api, config);
  const cardService = new CardService(api, guard, config);
  return { cardService, getCardsMock, getCardMock, createCardMock, api, guard };
}

describe('CardService.getCards - US1 board allowlist / default board (specs/001-agent-guardrails)', () => {
  it('filters a space-wide listing to allowedBoardIds', async () => {
    const cards = [card(1, 10), card(2, 20), card(3, 10)];
    const { cardService } = makeCardService({ allowedBoardIds: [10] }, cards);
    const result = (await cardService.getCards(5)) as Card[];
    expect(result.map((c) => c.id)).toEqual([1, 3]);
  });

  it('scopes listing to defaultBoardId when no boardId argument is given', async () => {
    const { cardService, getCardsMock } = makeCardService({ defaultBoardId: 10 }, []);
    await cardService.getCards(5);
    expect(getCardsMock).toHaveBeenCalledWith(5, 10, DEFAULT_PAGE_OPTIONS);
  });

  it('an explicit boardId argument wins over defaultBoardId', async () => {
    const { cardService, getCardsMock } = makeCardService({ defaultBoardId: 10 }, []);
    await cardService.getCards(5, 20);
    expect(getCardsMock).toHaveBeenCalledWith(5, 20, DEFAULT_PAGE_OPTIONS);
  });

  it('no allowlist/default set - board argument is null, so no board query param is sent', async () => {
    const { cardService, getCardsMock } = makeCardService({}, []);
    await cardService.getCards(5);
    expect(getCardsMock).toHaveBeenCalledWith(5, null, DEFAULT_PAGE_OPTIONS);
  });

  it('rejects an explicit boardId outside allowedBoardIds (direct addressing, not a silent filter)', async () => {
    const { cardService } = makeCardService({ allowedBoardIds: [10] }, []);
    await expect(cardService.getCards(5, 20)).rejects.toThrow('Board ID 20 is not in allowed list');
  });

  it('a card with no allowlist/default configured is returned unfiltered', async () => {
    const cards = [card(1, 10), card(2, 20)];
    const { cardService } = makeCardService({}, cards);
    const result = (await cardService.getCards(5)) as Card[];
    expect(result).toHaveLength(2);
  });
});

describe('TagService.getCardsWithTag / getCardsWithoutTag - inherit CardService filtering (US1, T007)', () => {
  function taggedCard(id: number, board_id: number, tag: string | null): Card {
    return { id, title: `card ${id}`, board_id, column_id: 1, tags: tag ? [{ id: 1, name: tag }] : [] } as Card;
  }

  it('getCardsWithTag only returns tagged cards from allowed boards', async () => {
    const cards = [taggedCard(1, 10, 'bug'), taggedCard(2, 20, 'bug'), taggedCard(3, 10, null)];
    const { cardService, api, guard } = makeCardService({ allowedBoardIds: [10] }, cards);
    const tagService = new TagService(api, guard, cardService);
    const result = await tagService.getCardsWithTag('bug');
    expect(result.map((c) => c.id)).toEqual([1]);
  });

  it('getCardsWithoutTag only returns untagged cards from allowed boards', async () => {
    const cards = [taggedCard(1, 10, 'bug'), taggedCard(2, 20, null), taggedCard(3, 10, null)];
    const { cardService, api, guard } = makeCardService({ allowedBoardIds: [10] }, cards);
    const tagService = new TagService(api, guard, cardService);
    const result = await tagService.getCardsWithoutTag('bug');
    expect(result.map((c) => c.id)).toEqual([3]);
  });
});

describe('CardService.createCard - US7 column/lane creation defaults (specs/001-agent-guardrails)', () => {
  it('uses config.defaultColumnId when columnId is omitted', async () => {
    const { cardService, createCardMock } = makeCardService({ defaultColumnId: 100 });
    await cardService.createCard({ title: 'T', boardId: 1 });
    expect(createCardMock).toHaveBeenCalledWith(expect.objectContaining({ column_id: 100 }));
  });

  it('an explicit columnId wins over the configured default', async () => {
    const { cardService, createCardMock } = makeCardService({ defaultColumnId: 100 });
    await cardService.createCard({ title: 'T', boardId: 1, columnId: 200 });
    expect(createCardMock).toHaveBeenCalledWith(expect.objectContaining({ column_id: 200 }));
  });

  it('throws mentioning both remedies when neither columnId nor a default is available', async () => {
    const { cardService } = makeCardService({});
    await expect(cardService.createCard({ title: 'T', boardId: 1 })).rejects.toThrow(/columnId/);
    await expect(cardService.createCard({ title: 'T', boardId: 1 })).rejects.toThrow(/KAITEN_DEFAULT_COLUMN_ID/);
  });

  it('applies config.defaultLaneId when laneId is omitted', async () => {
    const { cardService, createCardMock } = makeCardService({ defaultColumnId: 100, defaultLaneId: 55 });
    await cardService.createCard({ title: 'T', boardId: 1 });
    expect(createCardMock).toHaveBeenCalledWith(expect.objectContaining({ lane_id: 55 }));
  });

  it('an explicit laneId wins over the configured default lane', async () => {
    const { cardService, createCardMock } = makeCardService({ defaultColumnId: 100, defaultLaneId: 55 });
    await cardService.createCard({ title: 'T', boardId: 1, laneId: 77 });
    expect(createCardMock).toHaveBeenCalledWith(expect.objectContaining({ lane_id: 77 }));
  });

  it('a default column outside the column allowlist still rejects (defaults are guarded, not a bypass)', async () => {
    const { cardService } = makeCardService({ defaultColumnId: 999, allowedColumnIds: [100, 101] });
    await expect(cardService.createCard({ title: 'T', boardId: 1 })).rejects.toThrow('KAITEN_ALLOWED_COLUMN_IDS');
  });

  it('a default column that is protected still rejects', async () => {
    const { cardService } = makeCardService({ defaultColumnId: 200, protectedColumnIds: [200] });
    await expect(cardService.createCard({ title: 'T', boardId: 1 })).rejects.toThrow('KAITEN_PROTECTED_COLUMN_IDS');
  });
});
