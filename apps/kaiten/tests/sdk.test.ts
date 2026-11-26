import { describe, expect, it } from 'bun:test';
import { KaitenClient } from '@/kaiten';
import { KaitenSDK } from '@/sdk';
import type { KaitenConfig } from '@/kaiten';

interface Canned {
  status?: number;
  body?: unknown;
}

interface Call {
  method: string;
  url: string;
  body: unknown;
}

/** Fake fetch that serves canned responses in order and records every call made. */
function createFakeFetch(responses: Canned[]) {
  const calls: Call[] = [];
  let i = 0;
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const url = String(input);
    const body = init?.body !== undefined ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, url, body });
    const canned = responses[i++];
    if (!canned) {
      throw new Error(`createFakeFetch: no canned response queued for call #${i}: ${method} ${url}`);
    }
    return new Response(canned.body !== undefined ? JSON.stringify(canned.body) : '', {
      status: canned.status ?? 200,
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

/**
 * Builds a KaitenSDK backed by a fake fetch. `overrides` is merged into the
 * config passed to loadConfig() inside the SDK constructor - apiUrl/apiToken
 * are always supplied here so the SDK never depends on real environment or
 * dotfile state, even though a client is also injected.
 */
function makeSdk(responses: Canned[], overrides: Partial<KaitenConfig> = {}) {
  const { fetchImpl, calls } = createFakeFetch(responses);
  const client = new KaitenClient({ apiUrl: 'https://api.example.com', apiToken: 'token', fetchImpl });
  const sdk = new KaitenSDK({
    apiUrl: 'https://api.example.com',
    apiToken: 'token',
    allowedSpaceIds: null,
    allowedBoardIds: null,
    client,
    ...overrides,
  });
  return { sdk, calls };
}

const FULL_CARD = {
  id: 5,
  title: 'Card title',
  description: 'A description',
  board_id: 1,
  column_id: 2,
  lane_id: 3,
  condition: 1,
  tags: [{ id: 1, name: 'urgent' }],
  parents_count: 0,
  children_count: 2,
  // Extra fields that must NOT survive minimal projection.
  priority: 'high',
  owner_id: 99,
};

describe('KaitenSDK - constructor', () => {
  it('validates config even with an injected client (throws when apiUrl/apiToken are missing)', () => {
    const { fetchImpl } = createFakeFetch([]);
    const client = new KaitenClient({ apiUrl: 'https://api.example.com', apiToken: 'token', fetchImpl });
    // No apiUrl/apiToken override supplied - relies on loadConfig() failing
    // when the real environment has none configured either.
    const originalEnv = { ...process.env };
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('KAITEN_')) delete process.env[key];
    }
    try {
      expect(() => new KaitenSDK({ client })).toThrow(/KAITEN_API_URL/);
    } finally {
      for (const key of Object.keys(process.env)) {
        if (!(key in originalEnv)) delete process.env[key];
      }
      Object.assign(process.env, originalEnv);
    }
  });
});

describe('KaitenSDK - minimal projections', () => {
  it('getCard(id, true) returns exactly the minimal card field set', async () => {
    const { sdk } = makeSdk([{ body: FULL_CARD }]);
    const card = (await sdk.getCard(5, true)) as Record<string, unknown>;
    expect(Object.keys(card).sort()).toEqual(
      ['id', 'title', 'description', 'board_id', 'column_id', 'lane_id', 'condition', 'tags', 'parents_count', 'children_count'].sort()
    );
    expect(card).not.toHaveProperty('priority');
    expect(card).not.toHaveProperty('owner_id');
    expect(card.id).toBe(5);
    expect(card.lane_id).toBe(3);
  });

  it('getCard(id) without minimal returns the full card untouched', async () => {
    const { sdk } = makeSdk([{ body: FULL_CARD }]);
    const card = await sdk.getCard(5);
    expect(card).toEqual(FULL_CARD);
  });

  it('getCards(..., minimal=true) maps every card to the minimal field set', async () => {
    const { sdk } = makeSdk([{ body: [FULL_CARD] }]);
    const cards = (await sdk.getCards(1, null, true)) as Record<string, unknown>[];
    expect(cards).toHaveLength(1);
    expect(Object.keys(cards[0]!).sort()).toEqual(
      ['id', 'title', 'description', 'board_id', 'column_id', 'lane_id', 'condition', 'tags', 'parents_count', 'children_count'].sort()
    );
  });

  it('getSubtasks(id, true) returns exactly the minimal subtask field set', async () => {
    const { sdk } = makeSdk([{ body: [FULL_CARD] }]);
    const subtasks = (await sdk.getSubtasks(5, true)) as Record<string, unknown>[];
    expect(Object.keys(subtasks[0]!).sort()).toEqual(
      ['id', 'title', 'board_id', 'column_id', 'condition', 'parents_count', 'children_count'].sort()
    );
    expect(subtasks[0]).not.toHaveProperty('description');
    expect(subtasks[0]).not.toHaveProperty('tags');
  });

  it('getAllSubtasks(id, true) hits children?all=true and returns the minimal subtask field set', async () => {
    const { sdk, calls } = makeSdk([{ body: [FULL_CARD] }]);
    const subtasks = (await sdk.getAllSubtasks(5, true)) as Record<string, unknown>[];
    expect(calls[0]!.url).toBe('https://api.example.com/cards/5/children?all=true');
    expect(Object.keys(subtasks[0]!).sort()).toEqual(
      ['id', 'title', 'board_id', 'column_id', 'condition', 'parents_count', 'children_count'].sort()
    );
  });

  it('getParent(id, true) returns exactly the minimal parent field set', async () => {
    const { sdk } = makeSdk([
      { body: { id: 5, parent_link_ids: [11] } },
      { body: FULL_CARD },
    ]);
    const parent = (await sdk.getParent(5, true)) as Record<string, unknown>;
    expect(Object.keys(parent).sort()).toEqual(['id', 'title', 'board_id', 'column_id', 'condition'].sort());
    expect(parent).not.toHaveProperty('tags');
    expect(parent).not.toHaveProperty('lane_id');
  });

  it('getParent(id, true) returns null (not a minimal object) when there is no parent', async () => {
    const { sdk } = makeSdk([{ body: { id: 5 } }]);
    const parent = await sdk.getParent(5, true);
    expect(parent).toBeNull();
  });
});

describe('KaitenSDK - allowedSpaceIds validation', () => {
  it('getSpaces filters out spaces not in the allowed list', async () => {
    const { sdk } = makeSdk([{ body: [{ id: 1, title: 'A' }, { id: 2, title: 'B' }, { id: 3, title: 'C' }] }], {
      allowedSpaceIds: [1, 3],
    });
    const spaces = await sdk.getSpaces();
    expect(spaces.map((s) => s.id)).toEqual([1, 3]);
  });

  it('getSpaces returns everything when allowedSpaceIds is null', async () => {
    const { sdk } = makeSdk([{ body: [{ id: 1, title: 'A' }, { id: 2, title: 'B' }] }], { allowedSpaceIds: null });
    const spaces = await sdk.getSpaces();
    expect(spaces).toHaveLength(2);
  });

  it('getCards throws for a space not in the allowed list, without making a request', async () => {
    const { sdk, calls } = makeSdk([], { allowedSpaceIds: [10, 11] });
    await expect(sdk.getCards(99)).rejects.toThrow('Space ID 99 is not in allowed list');
    expect(calls.length).toBe(0);
  });

  it('getCards succeeds for a space in the allowed list', async () => {
    const { sdk, calls } = makeSdk([{ body: [] }], { allowedSpaceIds: [10, 11] });
    await sdk.getCards(10);
    expect(calls.length).toBe(1);
  });
});

describe('KaitenSDK - allowedBoardIds validation / _validateCardId', () => {
  it('archive() throws "not in allowed list" when the card belongs to a disallowed board, and never PATCHes', async () => {
    const { sdk, calls } = makeSdk([{ body: { id: 5, board_id: 999 } }], { allowedBoardIds: [1, 2] });
    await expect(sdk.archive(5)).rejects.toThrow('not in allowed list');
    // Only the validation GET should have happened - no PATCH to archive.
    expect(calls.length).toBe(1);
    expect(calls[0]!.method).toBe('GET');
  });

  it('archive() succeeds when the card belongs to an allowed board', async () => {
    const { sdk, calls } = makeSdk(
      [{ body: { id: 5, board_id: 1 } }, { body: { id: 5, condition: 2 } }],
      { allowedBoardIds: [1, 2] }
    );
    const card = await sdk.archive(5);
    expect(calls.length).toBe(2);
    expect(calls[1]!.body).toEqual({ condition: 2 });
    expect(card.id).toBe(5);
    expect(card.condition).toBe(2);
  });

  it('swallows a card lookup failure during validation and still completes the underlying call', async () => {
    // First call: the validation GET fails outright (e.g. network/API error
    // unrelated to allow-listing). Per spec, _validateCardId must swallow
    // this rather than rethrow, and the real archive PATCH should still happen.
    const { sdk, calls } = makeSdk(
      [
        { status: 500, body: { error: 'boom' } },
        { body: { id: 5, condition: 2 } },
      ],
      { allowedBoardIds: [1, 2] }
    );
    const card = await sdk.archive(5);
    expect(calls.length).toBe(2);
    expect(card.id).toBe(5);
    expect(card.condition).toBe(2);
  });

  it('does not validate card id when allowedBoardIds is null (no extra lookup call)', async () => {
    const { sdk, calls } = makeSdk([{ body: { id: 5, condition: 2 } }], { allowedBoardIds: null });
    await sdk.archive(5);
    expect(calls.length).toBe(1);
    expect(calls[0]!.method).toBe('PATCH');
  });
});

describe('KaitenSDK - hasTag / getTags', () => {
  it('hasTag returns true when the card has a tag with the given name', () => {
    const { sdk } = makeSdk([]);
    const card = { id: 1, title: 'x', board_id: 1, column_id: 1, tags: [{ id: 1, name: 'urgent' }] };
    expect(sdk.hasTag(card as never, 'urgent')).toBe(true);
    expect(sdk.hasTag(card as never, 'missing')).toBe(false);
  });

  it('hasTag returns false when the card has no tags', () => {
    const { sdk } = makeSdk([]);
    const card = { id: 1, title: 'x', board_id: 1, column_id: 1 };
    expect(sdk.hasTag(card as never, 'urgent')).toBe(false);
  });

  it('getTags returns the list of tag names, or an empty array when there are none', () => {
    const { sdk } = makeSdk([]);
    const tagged = { id: 1, title: 'x', board_id: 1, column_id: 1, tags: [{ id: 1, name: 'a' }, { id: 2, name: 'b' }] };
    expect(sdk.getTags(tagged as never)).toEqual(['a', 'b']);
    const untagged = { id: 1, title: 'x', board_id: 1, column_id: 1 };
    expect(sdk.getTags(untagged as never)).toEqual([]);
  });
});

describe('KaitenSDK - 3.2.0 new methods (delegation smoke)', () => {
  it('getCurrentUser GETs /users/current', async () => {
    const { sdk, calls } = makeSdk([{ body: { id: 1, full_name: 'Me' } }]);
    const user = await sdk.getCurrentUser();
    expect(calls[0]!.url).toBe('https://api.example.com/users/current');
    expect(user.id).toBe(1);
  });

  it('listTags GETs /tags with query/spaceId params', async () => {
    const { sdk, calls } = makeSdk([{ body: [{ id: 1, name: 'bug' }] }]);
    await sdk.listTags('bug', 9);
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe('/tags');
    expect(url.searchParams.get('query')).toBe('bug');
    expect(url.searchParams.get('space_id')).toBe('9');
  });

  it('getCardTypes GETs /card-types', async () => {
    const { sdk, calls } = makeSdk([{ body: [] }]);
    await sdk.getCardTypes();
    expect(calls[0]!.url).toBe('https://api.example.com/card-types');
  });

  it('getCustomProperties GETs /company/custom-properties', async () => {
    const { sdk, calls } = makeSdk([{ body: [] }]);
    await sdk.getCustomProperties();
    expect(calls[0]!.url).toBe('https://api.example.com/company/custom-properties');
  });

  it('addTimeLog POSTs snake_case body to /cards/{id}/time-logs', async () => {
    const { sdk, calls } = makeSdk([{ body: { id: 1 } }]);
    await sdk.addTimeLog(5, 30, '2026-07-20', 7, 'debugging');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe('https://api.example.com/cards/5/time-logs');
    expect(calls[0]!.body).toEqual({ time_spent: 30, for_date: '2026-07-20', role_id: 7, comment: 'debugging' });
  });

  it('blockCard POSTs to /cards/{id}/blockers', async () => {
    const { sdk, calls } = makeSdk([{ body: { id: 1 } }]);
    await sdk.blockCard(5, 'waiting', 9);
    expect(calls[0]!.url).toBe('https://api.example.com/cards/5/blockers');
    expect(calls[0]!.body).toEqual({ reason: 'waiting', blocker_card_id: 9 });
  });

  it('addExternalLink POSTs to /cards/{id}/external-links', async () => {
    const { sdk, calls } = makeSdk([{ body: { id: 1 } }]);
    await sdk.addExternalLink(5, 'https://example.com', 'PR');
    expect(calls[0]!.url).toBe('https://api.example.com/cards/5/external-links');
    expect(calls[0]!.body).toEqual({ url: 'https://example.com', description: 'PR' });
  });

  it('createCard passes typeId through as type_id', async () => {
    const { sdk, calls } = makeSdk([{ body: { id: 1 } }]);
    await sdk.createCard({ title: 'T', boardId: 1, columnId: 2, typeId: 4 });
    expect(calls[0]!.body).toMatchObject({ type_id: 4 });
  });
});

describe('KaitenSDK - moveToColumn', () => {
  it('returns { success: true, cardId, columnId, laneId } on success', async () => {
    const { sdk, calls } = makeSdk([
      { body: { id: 5, board_id: 1 } },
      { body: [{ id: 20, title: 'Done' }] },
      { body: { id: 5, column_id: 20 } },
    ]);
    const result = await sdk.moveToColumn(5, 20);
    expect(result).toEqual({ success: true, cardId: 5, columnId: 20, laneId: null });
    expect(calls[2]!.body).toEqual({ column_id: 20 });
  });

  it('includes the given laneId in the returned shape and the PATCH body', async () => {
    const { sdk, calls } = makeSdk([
      { body: { id: 5, board_id: 1 } },
      { body: [{ id: 20, title: 'Done' }] },
      { body: { id: 5, column_id: 20, lane_id: 7 } },
    ]);
    const result = await sdk.moveToColumn(5, 20, 7);
    expect(result).toEqual({ success: true, cardId: 5, columnId: 20, laneId: 7 });
    expect(calls[2]!.body).toEqual({ column_id: 20, lane_id: 7 });
  });
});
