import { describe, expect, it } from 'bun:test';
import { CardsApi } from '@/kaiten';
import { createFakeFetch, makeClient } from './helpers';
describe('CardsApi', () => {
  it('getCards without boardId hits /cards?space_id=... (documented endpoint, kaiten-mcp-zl8)', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: [] }]);
    const api = new CardsApi(makeClient(fetchImpl));
    await api.getCards(7);
    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.url).toBe('https://api.example.com/cards?space_id=7');
  });

  it('getCards with boardId adds board_id query param', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: [] }]);
    const api = new CardsApi(makeClient(fetchImpl));
    await api.getCards(7, 42);
    expect(calls[0]!.url).toBe('https://api.example.com/cards?space_id=7&board_id=42');
  });

  it('getCards maps every list option onto the documented query params', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: [] }]);
    const api = new CardsApi(makeClient(fetchImpl));
    await api.getCards(7, 42, { condition: 2, limit: 50, offset: 100, orderBy: 'updated', orderDirection: 'desc' });
    expect(calls[0]!.url).toBe(
      'https://api.example.com/cards?space_id=7&board_id=42&condition=2&limit=50&offset=100&order_by=updated&order_direction=desc'
    );
  });

  it("getCards condition: 'all' omits the condition param entirely (server then returns both)", async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: [] }]);
    const api = new CardsApi(makeClient(fetchImpl));
    await api.getCards(7, null, { condition: 'all', limit: 10 });
    expect(calls[0]!.url).toBe('https://api.example.com/cards?space_id=7&limit=10');
  });

  it('createCard POSTs to /cards with the given data', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ status: 201, body: { id: 1, title: 'New' } }]);
    const api = new CardsApi(makeClient(fetchImpl));
    const result = await api.createCard({ title: 'New', board_id: 1, column_id: 2 });
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe('https://api.example.com/cards');
    expect(calls[0]!.body).toEqual({ title: 'New', board_id: 1, column_id: 2 });
    expect(result.id).toBe(1);
    expect(result.title).toBe('New');
  });

  it('updateCard PATCHes /cards/{id} with the given data', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: { id: 5, title: 'Updated' } }]);
    const api = new CardsApi(makeClient(fetchImpl));
    await api.updateCard(5, { title: 'Updated' });
    expect(calls[0]!.method).toBe('PATCH');
    expect(calls[0]!.url).toBe('https://api.example.com/cards/5');
    expect(calls[0]!.body).toEqual({ title: 'Updated' });
  });

  it('deleteCard DELETEs /cards/{id}', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ status: 204 }]);
    const api = new CardsApi(makeClient(fetchImpl));
    await api.deleteCard(5);
    expect(calls[0]!.method).toBe('DELETE');
    expect(calls[0]!.url).toBe('https://api.example.com/cards/5');
  });

  it('addTag POSTs to /cards/{id}/tags with {name}', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: { id: 9, name: 'urgent' } }]);
    const api = new CardsApi(makeClient(fetchImpl));
    await api.addTag(5, 'urgent');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe('https://api.example.com/cards/5/tags');
    expect(calls[0]!.body).toEqual({ name: 'urgent' });
  });

  it('removeTag first GETs the card to resolve the tag id, then DELETEs it', async () => {
    const { fetchImpl, calls } = createFakeFetch([
      { body: { id: 5, tags: [{ id: 100, name: 'urgent' }, { id: 200, name: 'other' }] } },
      { status: 204 },
    ]);
    const api = new CardsApi(makeClient(fetchImpl));
    await api.removeTag(5, 'urgent');
    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.url).toBe('https://api.example.com/cards/5');
    expect(calls[1]!.method).toBe('DELETE');
    expect(calls[1]!.url).toBe('https://api.example.com/cards/5/tags/100');
  });

  it('removeTag throws and does not call DELETE when the tag is not on the card', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: { id: 5, tags: [{ id: 200, name: 'other' }] } }]);
    const api = new CardsApi(makeClient(fetchImpl));
    await expect(api.removeTag(5, 'urgent')).rejects.toThrow('Tag "urgent" not found on card');
    expect(calls.length).toBe(1);
  });

  it('moveCard: GETs card, GETs board columns, then PATCHes column_id on success', async () => {
    const { fetchImpl, calls } = createFakeFetch([
      { body: { id: 5, board_id: 1 } },
      { body: [{ id: 10, title: 'To Do' }, { id: 20, title: 'Done' }] },
      { body: { id: 5, column_id: 20 } },
    ]);
    const api = new CardsApi(makeClient(fetchImpl));
    const result = await api.moveCard(5, 20);
    expect(calls[0]!.url).toBe('https://api.example.com/cards/5');
    expect(calls[1]!.url).toBe('https://api.example.com/boards/1/columns');
    expect(calls[2]!.method).toBe('PATCH');
    expect(calls[2]!.url).toBe('https://api.example.com/cards/5');
    expect(calls[2]!.body).toEqual({ column_id: 20 });
    expect(result.id).toBe(5);
    expect(result.column_id).toBe(20);
  });

  it('moveCard includes lane_id in the PATCH body when a laneId is given', async () => {
    const { fetchImpl, calls } = createFakeFetch([
      { body: { id: 5, board_id: 1 } },
      { body: [{ id: 20, title: 'Done' }] },
      { body: { id: 5, column_id: 20, lane_id: 3 } },
    ]);
    const api = new CardsApi(makeClient(fetchImpl));
    await api.moveCard(5, 20, 3);
    expect(calls[2]!.body).toEqual({ column_id: 20, lane_id: 3 });
  });

  it('moveCard throws a helpful error listing available columns when the target column is not on the board', async () => {
    const { fetchImpl, calls } = createFakeFetch([
      { body: { id: 5, board_id: 1 } },
      { body: [{ id: 10, title: 'To Do' }, { id: 20, title: 'Done' }] },
    ]);
    const api = new CardsApi(makeClient(fetchImpl));
    await expect(api.moveCard(5, 999)).rejects.toThrow(
      'Column with ID 999 not found on board 1. Available columns on this board: 10 (To Do), 20 (Done)'
    );
    expect(calls.length).toBe(2); // no PATCH should have been issued
  });

  it('moveCard wraps a card-not-found lookup failure', async () => {
    const { fetchImpl } = createFakeFetch([{ status: 404, body: { error: 'not found' } }]);
    const api = new CardsApi(makeClient(fetchImpl));
    await expect(api.moveCard(999, 1)).rejects.toThrow('Card with ID 999 not found');
  });

  it('assignCard PATCHes members', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: {} }]);
    const api = new CardsApi(makeClient(fetchImpl));
    await api.assignCard(5, 42);
    expect(calls[0]!.method).toBe('PATCH');
    expect(calls[0]!.body).toEqual({ members: [{ id: 42 }] });
  });

  it('unassignCard PATCHes members_remove', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: {} }]);
    const api = new CardsApi(makeClient(fetchImpl));
    await api.unassignCard(5, 42);
    expect(calls[0]!.body).toEqual({ members_remove: [42] });
  });

  it('archiveCard PATCHes condition: 2', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: {} }]);
    const api = new CardsApi(makeClient(fetchImpl));
    await api.archiveCard(5);
    expect(calls[0]!.body).toEqual({ condition: 2 });
  });

  it('unarchiveCard PATCHes condition: 1', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: {} }]);
    const api = new CardsApi(makeClient(fetchImpl));
    await api.unarchiveCard(5);
    expect(calls[0]!.body).toEqual({ condition: 1 });
  });

  it('createChecklist POSTs to /cards/{id}/checklists', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: { id: 1, name: 'Steps' } }]);
    const api = new CardsApi(makeClient(fetchImpl));
    await api.createChecklist(5, 'Steps');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe('https://api.example.com/cards/5/checklists');
    expect(calls[0]!.body).toEqual({ name: 'Steps' });
  });

  it('deleteChecklist DELETEs /cards/{id}/checklists/{checklistId}', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ status: 204 }]);
    const api = new CardsApi(makeClient(fetchImpl));
    await api.deleteChecklist(5, 1);
    expect(calls[0]!.method).toBe('DELETE');
    expect(calls[0]!.url).toBe('https://api.example.com/cards/5/checklists/1');
  });

  it('updateChecklist PATCHes /cards/{id}/checklists/{checklistId}', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: { id: 1, name: 'Renamed' } }]);
    const api = new CardsApi(makeClient(fetchImpl));
    await api.updateChecklist(5, 1, { name: 'Renamed' });
    expect(calls[0]!.method).toBe('PATCH');
    expect(calls[0]!.url).toBe('https://api.example.com/cards/5/checklists/1');
    expect(calls[0]!.body).toEqual({ name: 'Renamed' });
  });

  it('checklist items live under /checklists/{id}/items, not /cards/{id}/checklists/{id}/items', async () => {
    const { fetchImpl, calls } = createFakeFetch([
      { body: { id: 1, text: 'Do it', checked: true } },
      { status: 201, body: { id: 2, text: 'New item' } },
      { status: 204 },
    ]);
    const api = new CardsApi(makeClient(fetchImpl));

    await api.toggleChecklistItem(11, 1, true);
    expect(calls[0]!.method).toBe('PATCH');
    expect(calls[0]!.url).toBe('https://api.example.com/checklists/11/items/1');
    expect(calls[0]!.body).toEqual({ checked: true });

    await api.addChecklistItem(11, 'New item');
    expect(calls[1]!.method).toBe('POST');
    expect(calls[1]!.url).toBe('https://api.example.com/checklists/11/items');
    expect(calls[1]!.body).toEqual({ text: 'New item' });

    await api.deleteChecklistItem(11, 2);
    expect(calls[2]!.method).toBe('DELETE');
    expect(calls[2]!.url).toBe('https://api.example.com/checklists/11/items/2');
  });
});
