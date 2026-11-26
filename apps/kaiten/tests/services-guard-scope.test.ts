import { describe, expect, it, mock, spyOn } from 'bun:test';
import type { KaitenApiPort, KaitenConfig } from '@/kaiten';
import { AccessGuard, CardService } from '@/services';

type Config = Pick<
  KaitenConfig,
  | 'allowedSpaceIds'
  | 'allowedBoardIds'
  | 'allowedColumnIds'
  | 'allowedLaneIds'
  | 'protectedColumnIds'
  | 'enforceScope'
  | 'defaultSpaceId'
  | 'defaultBoardId'
>;

const DEFAULT_CONFIG: Config = {
  allowedSpaceIds: null,
  allowedBoardIds: null,
  allowedColumnIds: null,
  allowedLaneIds: null,
  protectedColumnIds: null,
  enforceScope: false,
  defaultSpaceId: null,
  defaultBoardId: null,
};

function makeGuard(overrides: Partial<Config>, getCard: (cardId: number) => Promise<unknown> = async () => ({ id: 1 })) {
  const config: Config = { ...DEFAULT_CONFIG, ...overrides };
  const getCardMock = mock(getCard);
  const api = { cards: { getCard: getCardMock } } as unknown as KaitenApiPort;
  const guard = new AccessGuard(api, config);
  return { guard, getCardMock };
}

function makeCardService(overrides: Partial<Config>, opts: { getCard?: (id: number) => Promise<unknown>; moveCard?: () => Promise<unknown> } = {}) {
  const config: Config = { ...DEFAULT_CONFIG, ...overrides };
  // No column_id/lane_id by default: validateCardId's column/lane checks skip
  // (`!= null` guards) unless a test explicitly supplies the card's current
  // position via `opts.getCard`, keeping "current position" tests separate
  // from "write target" tests.
  const getCardMock = mock(opts.getCard ?? (async (id: number) => ({ id, board_id: 1 })));
  const createCardMock = mock(async () => ({ id: 99 }));
  const moveCardMock = mock(opts.moveCard ?? (async () => ({ id: 1 })));
  const updateCardMock = mock(async (id: number, data: Record<string, unknown>) => ({ id, ...data }));
  const api = {
    cards: { getCard: getCardMock, createCard: createCardMock, moveCard: moveCardMock, updateCard: updateCardMock },
  } as unknown as KaitenApiPort;
  const guard = new AccessGuard(api, config);
  const cardServiceConfig = {
    defaultSpaceId: null,
    defaultBoardId: overrides.defaultBoardId ?? null,
    allowedBoardIds: overrides.allowedBoardIds ?? null,
    allowedColumnIds: overrides.allowedColumnIds ?? null,
    allowedLaneIds: overrides.allowedLaneIds ?? null,
    // US7 (specs/001-agent-guardrails) added these to CardService's config
    // Pick; unused by the US2/US4 scope tests in this file, so both stay null.
    defaultColumnId: null,
    defaultLaneId: null,
  };
  const cardService = new CardService(api, guard, cardServiceConfig);
  return { cardService, getCardMock, createCardMock, moveCardMock, updateCardMock };
}

describe('AccessGuard.validateColumnTarget - US2 (specs/001-agent-guardrails)', () => {
  it('allows everything when no column guardrails are configured', () => {
    const { guard } = makeGuard({});
    expect(guard.validateColumnTarget(100)).toBe(true);
  });

  it('rejects a target outside the column allowlist, naming KAITEN_ALLOWED_COLUMN_IDS', () => {
    const { guard } = makeGuard({ allowedColumnIds: [100, 101] });
    expect(guard.validateColumnTarget(100)).toBe(true);
    expect(() => guard.validateColumnTarget(102)).toThrow('KAITEN_ALLOWED_COLUMN_IDS');
  });

  it('rejects a protected column as a write target, naming KAITEN_PROTECTED_COLUMN_IDS', () => {
    const { guard } = makeGuard({ protectedColumnIds: [200] });
    expect(() => guard.validateColumnTarget(200)).toThrow('KAITEN_PROTECTED_COLUMN_IDS');
  });

  it('protected wins even if the column is also in the allowlist', () => {
    const { guard } = makeGuard({ allowedColumnIds: [200], protectedColumnIds: [200] });
    expect(() => guard.validateColumnTarget(200)).toThrow('KAITEN_PROTECTED_COLUMN_IDS');
  });
});

describe('AccessGuard.validateLaneTarget - US2', () => {
  it('allows everything when no lane allowlist is configured', () => {
    const { guard } = makeGuard({});
    expect(guard.validateLaneTarget(5)).toBe(true);
  });

  it('rejects a target outside the lane allowlist, naming KAITEN_ALLOWED_LANE_IDS', () => {
    const { guard } = makeGuard({ allowedLaneIds: [5] });
    expect(guard.validateLaneTarget(5)).toBe(true);
    expect(() => guard.validateLaneTarget(6)).toThrow('KAITEN_ALLOWED_LANE_IDS');
  });
});

describe('AccessGuard.validateCardId - column/lane addressing (US2)', () => {
  it('rejects addressing a card currently in a disallowed column', async () => {
    const { guard } = makeGuard({ allowedColumnIds: [100] }, async () => ({ id: 5, column_id: 102 }));
    await expect(guard.validateCardId(5)).rejects.toThrow('KAITEN_ALLOWED_COLUMN_IDS');
  });

  it('rejects addressing a card currently in a disallowed lane', async () => {
    const { guard } = makeGuard({ allowedLaneIds: [5] }, async () => ({ id: 5, lane_id: 9 }));
    await expect(guard.validateCardId(5)).rejects.toThrow('KAITEN_ALLOWED_LANE_IDS');
  });

  it('reading/operating on a card in a protected column is NOT restricted (protection is write-target only)', async () => {
    const { guard } = makeGuard({ protectedColumnIds: [200] }, async () => ({ id: 5, column_id: 200 }));
    await expect(guard.validateCardId(5)).resolves.toBe(true);
  });

  it('allows a card whose column/lane are within the allowlists', async () => {
    const { guard } = makeGuard({ allowedColumnIds: [100], allowedLaneIds: [5] }, async () => ({ id: 5, column_id: 100, lane_id: 5 }));
    await expect(guard.validateCardId(5)).resolves.toBe(true);
  });

  it('no column/lane/board variables configured -> unchanged (no lookup at all)', async () => {
    const { guard, getCardMock } = makeGuard({});
    await expect(guard.validateCardId(5)).resolves.toBe(true);
    expect(getCardMock).not.toHaveBeenCalled();
  });
});

describe('CardService write paths enforce column/lane targets (US2)', () => {
  it('createCard into a disallowed column is rejected before the API call', async () => {
    const { cardService, createCardMock } = makeCardService({ allowedColumnIds: [100] });
    await expect(cardService.createCard({ title: 'T', boardId: 1, columnId: 102 })).rejects.toThrow('KAITEN_ALLOWED_COLUMN_IDS');
    expect(createCardMock).not.toHaveBeenCalled();
  });

  it('createCard into a protected column is rejected before the API call', async () => {
    const { cardService, createCardMock } = makeCardService({ protectedColumnIds: [200] });
    await expect(cardService.createCard({ title: 'T', boardId: 1, columnId: 200 })).rejects.toThrow('KAITEN_PROTECTED_COLUMN_IDS');
    expect(createCardMock).not.toHaveBeenCalled();
  });

  it('moveToColumn to a protected column is rejected before the API call', async () => {
    const { cardService, moveCardMock } = makeCardService({ protectedColumnIds: [200] });
    await expect(cardService.moveToColumn(5, 200)).rejects.toThrow('KAITEN_PROTECTED_COLUMN_IDS');
    expect(moveCardMock).not.toHaveBeenCalled();
  });

  it('moveToColumn to a disallowed lane is rejected before the API call', async () => {
    const { cardService, moveCardMock } = makeCardService({ allowedLaneIds: [5] });
    await expect(cardService.moveToColumn(5, 100, 9)).rejects.toThrow('KAITEN_ALLOWED_LANE_IDS');
    expect(moveCardMock).not.toHaveBeenCalled();
  });

  it('updateCard patch with column_id targeting a protected column is rejected', async () => {
    const { cardService, updateCardMock } = makeCardService({ protectedColumnIds: [200] });
    await expect(cardService.updateCard(5, { column_id: 200 })).rejects.toThrow('KAITEN_PROTECTED_COLUMN_IDS');
    expect(updateCardMock).not.toHaveBeenCalled();
  });

  it('updateCard patch with lane_id outside the allowlist is rejected', async () => {
    const { cardService, updateCardMock } = makeCardService({ allowedLaneIds: [5] });
    await expect(cardService.updateCard(5, { lane_id: 9 })).rejects.toThrow('KAITEN_ALLOWED_LANE_IDS');
    expect(updateCardMock).not.toHaveBeenCalled();
  });

  it('a card currently in a disallowed column rejects further operations (e.g. moveToColumn) via validateCardId', async () => {
    const { cardService, moveCardMock } = makeCardService(
      { allowedColumnIds: [100] },
      { getCard: async (id) => ({ id, board_id: 1, column_id: 999 }) }
    );
    await expect(cardService.moveToColumn(5, 100)).rejects.toThrow('KAITEN_ALLOWED_COLUMN_IDS');
    expect(moveCardMock).not.toHaveBeenCalled();
  });

  it('no column/lane variables set -> createCard/moveToColumn/updateCard behave exactly as before', async () => {
    const { cardService, createCardMock, moveCardMock, updateCardMock } = makeCardService({});
    await cardService.createCard({ title: 'T', boardId: 1, columnId: 102 });
    await cardService.moveToColumn(5, 200, 9);
    await cardService.updateCard(5, { column_id: 200, lane_id: 9 });
    expect(createCardMock).toHaveBeenCalledTimes(1);
    expect(moveCardMock).toHaveBeenCalledTimes(1);
    expect(updateCardMock).toHaveBeenCalledTimes(1);
  });
});

describe('AccessGuard - US4 enforce-scope (specs/001-agent-guardrails)', () => {
  it('validateSpaceId: explicit id equal to the default passes', () => {
    const { guard } = makeGuard({ enforceScope: true, defaultSpaceId: 1 });
    expect(guard.validateSpaceId(1)).toBe(true);
  });

  it('validateSpaceId: explicit id different from the default is rejected, naming KAITEN_ENFORCE_SCOPE', () => {
    const { guard } = makeGuard({ enforceScope: true, defaultSpaceId: 1 });
    expect(() => guard.validateSpaceId(2)).toThrow('KAITEN_ENFORCE_SCOPE');
  });

  it('validateBoardId: explicit id equal to the default passes', () => {
    const { guard } = makeGuard({ enforceScope: true, defaultBoardId: 10 });
    expect(guard.validateBoardId(10)).toBe(true);
  });

  it('validateBoardId: explicit id different from the default is rejected, naming KAITEN_ENFORCE_SCOPE', () => {
    const { guard } = makeGuard({ enforceScope: true, defaultBoardId: 10 });
    expect(() => guard.validateBoardId(20)).toThrow('KAITEN_ENFORCE_SCOPE');
  });

  it('validateCardId: a card on a foreign board is rejected under enforce-scope', async () => {
    const { guard } = makeGuard({ enforceScope: true, defaultBoardId: 10 }, async () => ({ id: 5, board_id: 20 }));
    await expect(guard.validateCardId(5)).rejects.toThrow('KAITEN_ENFORCE_SCOPE');
  });

  it('validateCardId: a card on the default board passes under enforce-scope', async () => {
    const { guard } = makeGuard({ enforceScope: true, defaultBoardId: 10 }, async () => ({ id: 5, board_id: 10 }));
    await expect(guard.validateCardId(5)).resolves.toBe(true);
  });

  it('flag set but no defaults configured is inert (operations pass) and emits one console.error warning', () => {
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { guard } = makeGuard({ enforceScope: true });
      expect(guard.validateSpaceId(123)).toBe(true);
      expect(guard.validateBoardId(456)).toBe(true);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0]![0]).toContain('KAITEN_ENFORCE_SCOPE');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('flag off -> unchanged (no rejection, no warning) even with defaults set', () => {
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { guard } = makeGuard({ enforceScope: false, defaultSpaceId: 1, defaultBoardId: 10 });
      expect(guard.validateSpaceId(2)).toBe(true);
      expect(guard.validateBoardId(20)).toBe(true);
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('composition: enforce-scope AND a board allowlist both apply (intersection) - either violation rejects', () => {
    // Board 10 is the enforced default AND within the allowlist - passes both checks.
    const { guard } = makeGuard({ enforceScope: true, defaultBoardId: 10, allowedBoardIds: [10, 30] });
    expect(guard.validateBoardId(10)).toBe(true);
    // Board 30 is within the allowlist but differs from the enforced default - enforce-scope rejects it.
    expect(() => guard.validateBoardId(30)).toThrow('KAITEN_ENFORCE_SCOPE');
    // Board 20 is outside the allowlist and also differs from the default - rejected (enforce-scope fires first).
    expect(() => guard.validateBoardId(20)).toThrow('KAITEN_ENFORCE_SCOPE');
  });
});
