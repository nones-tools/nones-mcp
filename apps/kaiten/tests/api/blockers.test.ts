import { describe, expect, it } from 'bun:test';
import { BlockersApi } from '@/kaiten';
import { createFakeFetch, makeClient } from './helpers';

describe('BlockersApi', () => {
  it('getBlockers GETs /cards/{id}/blockers', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: [] }]);
    const api = new BlockersApi(makeClient(fetchImpl));
    await api.getBlockers(5);
    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.url).toBe('https://api.example.com/cards/5/blockers');
  });

  it('blockCard POSTs an empty body when neither reason nor blockerCardId is given', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: { id: 1 } }]);
    const api = new BlockersApi(makeClient(fetchImpl));
    await api.blockCard(5);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe('https://api.example.com/cards/5/blockers');
    expect(calls[0]!.body).toEqual({});
  });

  it('blockCard POSTs reason and blocker_card_id (snake_case) when given', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: { id: 1 } }]);
    const api = new BlockersApi(makeClient(fetchImpl));
    await api.blockCard(5, 'waiting on design', 9);
    expect(calls[0]!.body).toEqual({ reason: 'waiting on design', blocker_card_id: 9 });
  });

  it('unblockCard DELETEs /cards/{id}/blockers/{blockerId} (gated - allowDelete: true in makeClient)', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ status: 204 }]);
    const api = new BlockersApi(makeClient(fetchImpl));
    await api.unblockCard(5, 9);
    expect(calls[0]!.method).toBe('DELETE');
    expect(calls[0]!.url).toBe('https://api.example.com/cards/5/blockers/9');
  });
});
