import { describe, expect, it } from 'bun:test';
import { SubtasksApi } from '@/kaiten';
import { createFakeFetch, makeClient } from './helpers';

describe('SubtasksApi', () => {
  it('createSubtask creates a card on the parent board/column, then POSTs to attach it as a child', async () => {
    const { fetchImpl, calls } = createFakeFetch([
      { body: { id: 1, board_id: 3, column_id: 4 } },
      { status: 201, body: { id: 99, title: 'Sub', board_id: 3, column_id: 4 } },
      { status: 201, body: { success: true } },
    ]);
    const api = new SubtasksApi(makeClient(fetchImpl));
    const result = await api.createSubtask(1, 'Sub', 2);

    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.url).toBe('https://api.example.com/cards/1');

    expect(calls[1]!.method).toBe('POST');
    expect(calls[1]!.url).toBe('https://api.example.com/cards');
    expect(calls[1]!.body).toEqual({ title: 'Sub', board_id: 3, column_id: 4, position: 2 });

    expect(calls[2]!.method).toBe('POST');
    expect(calls[2]!.url).toBe('https://api.example.com/cards/1/children');
    expect(calls[2]!.body).toEqual({ card_id: 99 });

    expect(result).toEqual({ id: 99, title: 'Sub', board_id: 3, column_id: 4 });
  });

  it('getParent prefers parent_link_ids[0], fetched in full', async () => {
    const { fetchImpl, calls } = createFakeFetch([
      { body: { id: 5, parent_link_ids: [11, 12], parents: [{ id: 999 }] } },
      { body: { id: 11, title: 'Parent Card' } },
    ]);
    const api = new SubtasksApi(makeClient(fetchImpl));
    const parent = await api.getParent(5);
    expect(calls.length).toBe(2);
    expect(calls[1]!.url).toBe('https://api.example.com/cards/11');
    expect(parent?.id).toBe(11);
    expect(parent?.title).toBe('Parent Card');
  });

  it('getParent falls back to parents[0] when parent_link_ids is empty', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: { id: 5, parent_link_ids: [], parents: [{ id: 22, title: 'Fallback Parent' }] } }]);
    const api = new SubtasksApi(makeClient(fetchImpl));
    const parent = await api.getParent(5);
    expect(calls.length).toBe(1);
    expect(parent?.id).toBe(22);
    expect(parent?.title).toBe('Fallback Parent');
  });

  it('getParent returns null when there is no parent_link_ids or parents', async () => {
    const { fetchImpl } = createFakeFetch([{ body: { id: 5 } }]);
    const api = new SubtasksApi(makeClient(fetchImpl));
    const parent = await api.getParent(5);
    expect(parent).toBeNull();
  });

  it('detachFromParent errors when the card has no parent', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: { id: 5 } }]);
    const api = new SubtasksApi(makeClient(fetchImpl));
    await expect(api.detachFromParent(5)).rejects.toThrow('Card has no parent');
    expect(calls.length).toBe(1);
  });

  it('detachFromParent DELETEs /cards/{parentId}/children/{cardId} when a parent exists', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: { id: 5, parents: [{ id: 22 }] } }, { status: 204 }]);
    const api = new SubtasksApi(makeClient(fetchImpl));
    await api.detachFromParent(5);
    expect(calls[1]!.method).toBe('DELETE');
    expect(calls[1]!.url).toBe('https://api.example.com/cards/22/children/5');
  });

  it('getSubtasks GETs /cards/{id}/children', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: [] }]);
    const api = new SubtasksApi(makeClient(fetchImpl));
    await api.getSubtasks(5);
    expect(calls[0]!.url).toBe('https://api.example.com/cards/5/children');
  });

  it('getAllSubtasks GETs /cards/{id}/children?all=true', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: [] }]);
    const api = new SubtasksApi(makeClient(fetchImpl));
    await api.getAllSubtasks(5);
    expect(calls[0]!.url).toBe('https://api.example.com/cards/5/children?all=true');
  });
});
