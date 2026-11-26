import { describe, expect, it } from 'bun:test';
import { UsersApi } from '@/kaiten';
import { createFakeFetch, makeClient } from './helpers';

describe('UsersApi', () => {
  it('getUsers GETs /users', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: [] }]);
    const api = new UsersApi(makeClient(fetchImpl));
    await api.getUsers();
    expect(calls[0]!.url).toBe('https://api.example.com/users');
  });

  it('getCurrentUser GETs /users/current', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: { id: 1 } }]);
    const api = new UsersApi(makeClient(fetchImpl));
    await api.getCurrentUser();
    expect(calls[0]!.url).toBe('https://api.example.com/users/current');
  });

  it('searchUsers GETs /users?search={query}', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: [] }]);
    const api = new UsersApi(makeClient(fetchImpl));
    await api.searchUsers('john');
    expect(calls[0]!.url).toBe('https://api.example.com/users?search=john');
  });
});
