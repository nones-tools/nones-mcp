import { describe, expect, it } from 'bun:test';
import { LinksApi } from '@/kaiten';
import { createFakeFetch, makeClient } from './helpers';

describe('LinksApi', () => {
  it('getExternalLinks GETs /cards/{id}/external-links', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: [] }]);
    const api = new LinksApi(makeClient(fetchImpl));
    await api.getExternalLinks(5);
    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.url).toBe('https://api.example.com/cards/5/external-links');
  });

  it('addExternalLink POSTs url only when description is omitted', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: { id: 1 } }]);
    const api = new LinksApi(makeClient(fetchImpl));
    await api.addExternalLink(5, 'https://example.com/pr/1');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe('https://api.example.com/cards/5/external-links');
    expect(calls[0]!.body).toEqual({ url: 'https://example.com/pr/1' });
  });

  it('addExternalLink POSTs url and description when both given', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: { id: 1 } }]);
    const api = new LinksApi(makeClient(fetchImpl));
    await api.addExternalLink(5, 'https://example.com/pr/1', 'PR #1');
    expect(calls[0]!.body).toEqual({ url: 'https://example.com/pr/1', description: 'PR #1' });
  });

  it('removeExternalLink DELETEs /cards/{id}/external-links/{linkId} (gated - allowDelete: true in makeClient)', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ status: 204 }]);
    const api = new LinksApi(makeClient(fetchImpl));
    await api.removeExternalLink(5, 9);
    expect(calls[0]!.method).toBe('DELETE');
    expect(calls[0]!.url).toBe('https://api.example.com/cards/5/external-links/9');
  });
});
