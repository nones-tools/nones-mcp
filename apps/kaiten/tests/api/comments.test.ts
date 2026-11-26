import { describe, expect, it } from 'bun:test';
import { CommentsApi } from '@/kaiten';
import { createFakeFetch, makeClient } from './helpers';

describe('CommentsApi', () => {
  it('getComments GETs /cards/{id}/comments', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: [] }]);
    const api = new CommentsApi(makeClient(fetchImpl));
    await api.getComments(5);
    expect(calls[0]!.url).toBe('https://api.example.com/cards/5/comments');
  });

  it('createComment POSTs card_id, text, parent_id', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ status: 201, body: { id: 1, text: 'Hi' } }]);
    const api = new CommentsApi(makeClient(fetchImpl));
    await api.createComment(5, 'Hi', 2);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe('https://api.example.com/cards/5/comments');
    expect(calls[0]!.body).toEqual({ card_id: 5, text: 'Hi', parent_id: 2 });
  });

  it('updateComment PATCHes /comments/{id}', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: { id: 1, text: 'Updated' } }]);
    const api = new CommentsApi(makeClient(fetchImpl));
    await api.updateComment(1, 'Updated');
    expect(calls[0]!.method).toBe('PATCH');
    expect(calls[0]!.url).toBe('https://api.example.com/comments/1');
    expect(calls[0]!.body).toEqual({ text: 'Updated' });
  });

  it('deleteComment DELETEs /comments/{id}', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ status: 204 }]);
    const api = new CommentsApi(makeClient(fetchImpl));
    await api.deleteComment(1);
    expect(calls[0]!.method).toBe('DELETE');
    expect(calls[0]!.url).toBe('https://api.example.com/comments/1');
  });
});
