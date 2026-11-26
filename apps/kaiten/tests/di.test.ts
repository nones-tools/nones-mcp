import { describe, expect, it } from 'bun:test';
import type { ServiceIdentifier } from 'inversify';
import { buildContainer, TOKENS } from '@/di';
import { KaitenClient, type KaitenApiPort } from '@/kaiten';
import { KaitenSDK } from '@/sdk';
import { createFakeFetch } from './api/helpers';

function makeContainer(responses: Parameters<typeof createFakeFetch>[0] = []) {
  const { fetchImpl, calls } = createFakeFetch(responses);
  const client = new KaitenClient({ apiUrl: 'https://api.example.com', apiToken: 'token', fetchImpl });
  const container = buildContainer({
    apiUrl: 'https://api.example.com',
    apiToken: 'token',
    allowedSpaceIds: null,
    allowedBoardIds: null,
    client,
  });
  return { container, calls };
}

describe('DI container - buildContainer', () => {
  it('resolves KaitenSDK as a singleton (same instance on every get())', () => {
    const { container } = makeContainer();
    const a = container.get(TOKENS.KaitenSDK);
    const b = container.get(TOKENS.KaitenSDK);
    expect(a).toBeInstanceOf(KaitenSDK);
    expect(a).toBe(b);
  });

  it('honors an injected fake client override - no real network call, resolved SDK uses it', async () => {
    const { container, calls } = makeContainer([{ body: { id: 1, full_name: 'Me' } }]);
    const sdk = container.get(TOKENS.KaitenSDK);
    const user = await sdk.getCurrentUser();
    expect(calls[0]!.url).toBe('https://api.example.com/users/current');
    expect(user.id).toBe(1);
  });

  it('honors config overrides (e.g. allowedSpaceIds) inside the resolved SDK', async () => {
    const { container } = makeContainer([{ body: [{ id: 1, title: 'A' }, { id: 2, title: 'B' }] }]);
    const sdk = container.get(TOKENS.KaitenSDK);
    const spaces = await sdk.getSpaces();
    // allowedSpaceIds: null in makeContainer() -> no filtering.
    expect(spaces).toHaveLength(2);
  });

  it('resolves individual services directly, each a working, singleton instance', () => {
    const { container } = makeContainer();
    const cardService1 = container.get(TOKENS.CardService);
    const cardService2 = container.get(TOKENS.CardService);
    expect(cardService1).toBe(cardService2);

    const guard1 = container.get(TOKENS.AccessGuard);
    const guard2 = container.get(TOKENS.AccessGuard);
    expect(guard1).toBe(guard2);

    // Resolvable without throwing - proves @injectable/@inject wiring works
    // for every bound service, not just the ones exercised above.
    const rest: ServiceIdentifier<unknown>[] = [
      TOKENS.TagService, TOKENS.HierarchyService, TOKENS.CommentService, TOKENS.BoardService,
      TOKENS.UserService, TOKENS.GitService, TOKENS.FileService, TOKENS.ChecklistService,
      TOKENS.TimeLogService, TOKENS.BlockerService, TOKENS.LinkService, TOKENS.DictionaryService,
    ];
    for (const token of rest) {
      expect(() => container.get(token)).not.toThrow();
    }
  });

  it('binds KaitenApi behind the KaitenApiPort token - resource groups are usable through the port', async () => {
    const { container, calls } = makeContainer([{ body: [{ id: 1 }] }]);
    const api: KaitenApiPort = container.get(TOKENS.KaitenApi);
    await api.boards.getSpaces();
    expect(calls[0]!.url).toBe('https://api.example.com/spaces');
    // Structural check: the port only exposes the resource groups, no HTTP
    // client internals leak through it.
    expect(Object.keys(api).sort()).toEqual(
      ['blockers', 'boards', 'cards', 'comments', 'company', 'files', 'links', 'subtasks', 'timeLogs', 'users'].sort()
    );
  });

  it('a fresh buildContainer() call produces independent instances (no cross-test/global singleton)', () => {
    const { container: c1 } = makeContainer();
    const { container: c2 } = makeContainer();
    expect(c1.get(TOKENS.KaitenSDK)).not.toBe(c2.get(TOKENS.KaitenSDK));
  });

  it('propagates loadConfig() validation errors when neither overrides nor env supply apiUrl/apiToken', () => {
    const originalEnv = { ...process.env };
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('KAITEN_')) delete process.env[key];
    }
    try {
      const container = buildContainer();
      expect(() => container.get(TOKENS.Config)).toThrow(/KAITEN_API_URL/);
    } finally {
      for (const key of Object.keys(process.env)) {
        if (!(key in originalEnv)) delete process.env[key];
      }
      Object.assign(process.env, originalEnv);
    }
  });
});
