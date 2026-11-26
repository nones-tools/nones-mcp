import { describe, expect, it } from 'bun:test';
import { BoardsApi } from '@/kaiten';
import { createFakeFetch, makeClient } from './helpers';

describe('BoardsApi', () => {
  it('getSpaces GETs /spaces', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: [{ id: 1, title: 'Space' }] }]);
    const api = new BoardsApi(makeClient(fetchImpl));
    const spaces = await api.getSpaces();
    expect(calls[0]!.url).toBe('https://api.example.com/spaces');
    expect(spaces).toEqual([{ id: 1, title: 'Space' }]);
  });

  it('getBoards GETs /spaces/{id}/boards', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: [] }]);
    const api = new BoardsApi(makeClient(fetchImpl));
    await api.getBoards(7);
    expect(calls[0]!.url).toBe('https://api.example.com/spaces/7/boards');
  });

  it('getColumns GETs /boards/{id}/columns', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: [] }]);
    const api = new BoardsApi(makeClient(fetchImpl));
    await api.getColumns(3);
    expect(calls[0]!.url).toBe('https://api.example.com/boards/3/columns');
  });

  it('getLanes GETs /boards/{id}/lanes', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: [{ id: 1, title: 'Lane', board_id: 3 }] }]);
    const api = new BoardsApi(makeClient(fetchImpl));
    const lanes = await api.getLanes(3);
    expect(calls[0]!.url).toBe('https://api.example.com/boards/3/lanes');
    expect(lanes).toEqual([{ id: 1, title: 'Lane', board_id: 3 }]);
  });
});
