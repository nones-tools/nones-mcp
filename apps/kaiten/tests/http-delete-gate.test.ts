import { describe, expect, it } from 'bun:test';
import { KaitenClient, KaitenDeleteDisabledError } from '@/kaiten';

function makeClient(fetchImpl: typeof fetch, allowDelete?: boolean): KaitenClient {
  return new KaitenClient({ apiUrl: 'https://api.example.com', apiToken: 'test-token', fetchImpl, allowDelete });
}

describe('KaitenClient - DELETE gate', () => {
  it('throws KaitenDeleteDisabledError and never calls fetch when allowDelete is not set (default false)', async () => {
    let fetchCalled = false;
    const fetchImpl = (async () => {
      fetchCalled = true;
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    await expect(client.delete('/cards/1')).rejects.toBeInstanceOf(KaitenDeleteDisabledError);
    expect(fetchCalled).toBe(false);
  });

  it('throws KaitenDeleteDisabledError when allowDelete is explicitly false', async () => {
    const fetchImpl = (async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
    const client = makeClient(fetchImpl, false);
    await expect(client.delete('/cards/1')).rejects.toBeInstanceOf(KaitenDeleteDisabledError);
  });

  it('the error message names the env var and tells agents to relay it, not set it', async () => {
    const fetchImpl = (async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    try {
      await client.delete('/cards/1');
      throw new Error('expected client.delete to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(KaitenDeleteDisabledError);
      const message = (err as Error).message;
      expect(message).toContain('KAITEN_API_DELETE_ALLOW=true');
      expect(message).toContain('AI agents: do not set this variable yourself');
      expect(message).toContain('irreversible');
    }
  });

  it('performs the DELETE request when allowDelete is true', async () => {
    let capturedInit: RequestInit | undefined;
    let capturedUrl = '';
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;
    const client = makeClient(fetchImpl, true);
    const result = await client.delete('/cards/1');
    expect(capturedUrl).toBe('https://api.example.com/cards/1');
    expect(capturedInit?.method).toBe('DELETE');
    expect(result).toBeUndefined();
  });

  it('GET is unaffected by allowDelete (default false)', async () => {
    const fetchImpl = (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    await expect(client.get('/cards/1')).resolves.toEqual({});
  });

  it('POST is unaffected by allowDelete (default false)', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ id: 1 }), { status: 201 })) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    await expect(client.post('/cards', { title: 'x' })).resolves.toEqual({ id: 1 });
  });

  it('PATCH is unaffected by allowDelete (default false)', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ id: 1 }), { status: 200 })) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    await expect(client.patch('/cards/1', { title: 'x' })).resolves.toEqual({ id: 1 });
  });
});
