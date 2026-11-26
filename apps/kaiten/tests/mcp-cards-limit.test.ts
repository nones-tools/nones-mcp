import { describe, expect, mock, test } from 'bun:test';
import type { KaitenSDK } from '@/sdk';
import { tools } from '@/mcp/tools';

/** What the kaiten_cards handler forwards when no list option is given (all keys present, undefined). */
const NO_LIST_OPTIONS = { condition: undefined, limit: undefined, offset: undefined, orderBy: undefined, orderDirection: undefined };

/**
 * US6 (specs/001-agent-guardrails): `KAITEN_CARDS_LIMIT` truncation and
 * `KAITEN_MINIMAL_DEFAULT` for `kaiten_cards`/`kaiten_find_cards`. Drives the
 * tool handlers directly with a stub SDK, same pattern as tests/mcp-tools.test.ts.
 */
function toolByName(name: string) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool ${name} not found in registry`);
  return tool;
}

function makeCard(id: number) {
  return { id, title: `card ${id}`, board_id: 1, column_id: 1 };
}

function stubSdk(getCards: ReturnType<typeof mock>, config: Record<string, unknown> = {}): KaitenSDK {
  return { getCards, config } as unknown as KaitenSDK;
}

describe('kaiten_cards - US6 cards limit / minimal default', () => {
  test('limit unset -> plain array, unchanged reference', async () => {
    const cards = [makeCard(1), makeCard(2)];
    const getCards = mock(async () => cards);
    const sdk = stubSdk(getCards, {});
    const result = await toolByName('kaiten_cards').handler(sdk, {});
    expect(result).toBe(cards);
  });

  test('limit larger than result -> plain array', async () => {
    const cards = [makeCard(1), makeCard(2)];
    const getCards = mock(async () => cards);
    const sdk = stubSdk(getCards, { cardsLimit: 5 });
    const result = await toolByName('kaiten_cards').handler(sdk, {});
    expect(result).toBe(cards);
  });

  test('truncation -> wrapper with correct total/returned and cards.length === limit', async () => {
    const cards = [makeCard(1), makeCard(2), makeCard(3), makeCard(4), makeCard(5)];
    const getCards = mock(async () => cards);
    const sdk = stubSdk(getCards, { cardsLimit: 2 });
    const result = (await toolByName('kaiten_cards').handler(sdk, {})) as {
      truncated: true;
      total: number;
      returned: number;
      note: string;
      cards: unknown[];
    };
    expect(result.truncated).toBe(true);
    expect(result.total).toBe(5);
    expect(result.returned).toBe(2);
    expect(result.cards).toHaveLength(2);
    expect(result.note).toContain('KAITEN_CARDS_LIMIT');
  });

  test('minimalDefault: true -> minimal shape by default', async () => {
    const getCards = mock(async () => []);
    const sdk = stubSdk(getCards, { minimalDefault: true });
    await toolByName('kaiten_cards').handler(sdk, {});
    expect(getCards).toHaveBeenCalledWith(null, null, true, NO_LIST_OPTIONS);
  });

  test('explicit minimal:false wins over minimalDefault: true', async () => {
    const getCards = mock(async () => []);
    const sdk = stubSdk(getCards, { minimalDefault: true });
    await toolByName('kaiten_cards').handler(sdk, { minimal: false });
    expect(getCards).toHaveBeenCalledWith(null, null, false, NO_LIST_OPTIONS);
  });

  test('explicit minimal:true wins regardless of minimalDefault', async () => {
    const getCards = mock(async () => []);
    const sdk = stubSdk(getCards, { minimalDefault: false });
    await toolByName('kaiten_cards').handler(sdk, { minimal: true });
    expect(getCards).toHaveBeenCalledWith(null, null, true, NO_LIST_OPTIONS);
  });

  test('minimalDefault unset -> full payload as today', async () => {
    const getCards = mock(async () => []);
    const sdk = stubSdk(getCards, {});
    await toolByName('kaiten_cards').handler(sdk, {});
    expect(getCards).toHaveBeenCalledWith(null, null, false, NO_LIST_OPTIONS);
  });
});

describe('kaiten_find_cards - US6 cards limit', () => {
  function taggedCard(id: number) {
    return { id, title: `T${id}`, board_id: 1, column_id: 1, tags: [{ id: 1, name: 'x' }] };
  }

  test('limit unset -> plain projected array', async () => {
    const cards = [taggedCard(1), taggedCard(2)];
    const getCards = mock(async () => cards);
    const sdk = stubSdk(getCards, {});
    const result = await toolByName('kaiten_find_cards').handler(sdk, { tagName: 'x' });
    expect(result).toEqual(cards.map((c) => ({ id: c.id, title: c.title, board_id: c.board_id, column_id: c.column_id, tags: c.tags })));
  });

  test('truncation wraps the filtered/projected list', async () => {
    const cards = Array.from({ length: 6 }, (_, i) => taggedCard(i + 1));
    const getCards = mock(async () => cards);
    const sdk = stubSdk(getCards, { cardsLimit: 3 });
    const result = (await toolByName('kaiten_find_cards').handler(sdk, { tagName: 'x' })) as {
      truncated: true;
      total: number;
      returned: number;
      cards: unknown[];
    };
    expect(result.truncated).toBe(true);
    expect(result.total).toBe(6);
    expect(result.returned).toBe(3);
    expect(result.cards).toHaveLength(3);
  });

  test('limit larger than the filtered result -> plain array', async () => {
    const cards = [taggedCard(1)];
    const getCards = mock(async () => cards);
    const sdk = stubSdk(getCards, { cardsLimit: 10 });
    const result = await toolByName('kaiten_find_cards').handler(sdk, { tagName: 'x' });
    expect(Array.isArray(result)).toBe(true);
  });
});
