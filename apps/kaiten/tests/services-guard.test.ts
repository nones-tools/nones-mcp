import { describe, expect, it, mock } from 'bun:test';
import type { KaitenApi } from '@/kaiten';
import { AccessGuard } from '@/services';

function makeGuard(
  config: { allowedSpaceIds?: number[] | null; allowedBoardIds?: number[] | null },
  getCard: (cardId: number) => Promise<unknown> = async () => ({ id: 1 })
) {
  const getCardMock = mock(getCard);
  const api = { cards: { getCard: getCardMock } } as unknown as KaitenApi;
  const guard = new AccessGuard(api, {
    allowedSpaceIds: config.allowedSpaceIds ?? null,
    allowedBoardIds: config.allowedBoardIds ?? null,
  });
  return { guard, getCardMock };
}

describe('AccessGuard.validateSpaceId', () => {
  it('allows everything when no allowlist is configured', () => {
    const { guard } = makeGuard({});
    expect(guard.validateSpaceId(123)).toBe(true);
  });

  it('allows null/undefined space ids even with an allowlist', () => {
    const { guard } = makeGuard({ allowedSpaceIds: [1, 2] });
    expect(guard.validateSpaceId(null)).toBe(true);
    expect(guard.validateSpaceId(undefined)).toBe(true);
  });

  it('allows a listed space id', () => {
    const { guard } = makeGuard({ allowedSpaceIds: [1, 2] });
    expect(guard.validateSpaceId(2)).toBe(true);
  });

  it('throws for an unlisted space id', () => {
    const { guard } = makeGuard({ allowedSpaceIds: [1, 2] });
    expect(() => guard.validateSpaceId(99)).toThrow('Space ID 99 is not in allowed list');
  });
});

describe('AccessGuard.validateBoardId', () => {
  it('allows everything when no allowlist is configured', () => {
    const { guard } = makeGuard({});
    expect(guard.validateBoardId(123)).toBe(true);
  });

  it('allows a listed board id and throws for an unlisted one', () => {
    const { guard } = makeGuard({ allowedBoardIds: [10] });
    expect(guard.validateBoardId(10)).toBe(true);
    expect(() => guard.validateBoardId(11)).toThrow('Board ID 11 is not in allowed list');
  });
});

describe('AccessGuard.validateCardId', () => {
  it('skips the lookup entirely when no board allowlist is configured', async () => {
    const { guard, getCardMock } = makeGuard({ allowedBoardIds: null });
    await expect(guard.validateCardId(5)).resolves.toBe(true);
    expect(getCardMock).not.toHaveBeenCalled();
  });

  it('skips the lookup for a null/undefined card id', async () => {
    const { guard, getCardMock } = makeGuard({ allowedBoardIds: [1] });
    await expect(guard.validateCardId(null)).resolves.toBe(true);
    await expect(guard.validateCardId(undefined)).resolves.toBe(true);
    expect(getCardMock).not.toHaveBeenCalled();
  });

  it('allows a card on an allowed board', async () => {
    const { guard, getCardMock } = makeGuard({ allowedBoardIds: [1, 2] }, async () => ({ id: 5, board_id: 2 }));
    await expect(guard.validateCardId(5)).resolves.toBe(true);
    expect(getCardMock).toHaveBeenCalledWith(5);
  });

  it('throws when the card belongs to a disallowed board', async () => {
    const { guard } = makeGuard({ allowedBoardIds: [1, 2] }, async () => ({ id: 5, board_id: 999 }));
    await expect(guard.validateCardId(5)).rejects.toThrow(
      'Card 5 belongs to board 999 which is not in allowed list'
    );
  });

  it('swallows lookup failures (e.g. card not found) and still validates', async () => {
    const { guard } = makeGuard({ allowedBoardIds: [1, 2] }, async () => {
      throw new Error('Kaiten API request failed: GET /cards/5 -> 500');
    });
    await expect(guard.validateCardId(5)).resolves.toBe(true);
  });

  it('allows a card whose payload has no board_id', async () => {
    const { guard } = makeGuard({ allowedBoardIds: [1] }, async () => ({ id: 5 }));
    await expect(guard.validateCardId(5)).resolves.toBe(true);
  });
});
