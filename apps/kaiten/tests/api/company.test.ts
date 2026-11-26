import { describe, expect, it } from 'bun:test';
import { CompanyApi } from '@/kaiten';
import { createFakeFetch, makeClient } from './helpers';

describe('CompanyApi', () => {
  it('getTags GETs /tags with no query params when none are given', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: [] }]);
    const api = new CompanyApi(makeClient(fetchImpl));
    await api.getTags();
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe('/tags');
    expect(url.searchParams.has('query')).toBe(false);
    expect(url.searchParams.has('space_id')).toBe(false);
  });

  it('getTags GETs /tags with query and space_id params', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: [] }]);
    const api = new CompanyApi(makeClient(fetchImpl));
    await api.getTags('bug', 12);
    const url = new URL(calls[0]!.url);
    expect(url.searchParams.get('query')).toBe('bug');
    expect(url.searchParams.get('space_id')).toBe('12');
  });

  it('getCardTypes GETs /card-types', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: [] }]);
    const api = new CompanyApi(makeClient(fetchImpl));
    await api.getCardTypes();
    expect(calls[0]!.url).toBe('https://api.example.com/card-types');
  });

  it('getCustomProperties GETs /company/custom-properties', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: [] }]);
    const api = new CompanyApi(makeClient(fetchImpl));
    await api.getCustomProperties();
    expect(calls[0]!.url).toBe('https://api.example.com/company/custom-properties');
  });
});
