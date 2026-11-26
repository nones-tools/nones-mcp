import { describe, expect, it } from 'bun:test';
import { KaitenApiError, KaitenClient, KaitenTimeoutError } from '@/kaiten';

function makeClient(fetchImpl: typeof fetch, opts: { timeoutMs?: number | null; retries?: number | null } = {}): KaitenClient {
  return new KaitenClient({
    apiUrl: 'https://api.example.com',
    apiToken: 'test-token',
    fetchImpl,
    allowDelete: true,
    ...opts,
  });
}

function delay<T>(ms: number, value: T, signal?: AbortSignal | null): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(value), ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('The operation was aborted', 'AbortError'));
    });
  });
}

describe('KaitenClient - timeout', () => {
  it('a request that outlives the budget fails with KaitenTimeoutError naming the variable', async () => {
    const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) =>
      delay(50, new Response('{}', { status: 200 }), init?.signal)) as unknown as typeof fetch;
    const client = makeClient(fetchImpl, { timeoutMs: 10 });
    try {
      await client.get('/cards/1');
      throw new Error('expected client.get to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(KaitenTimeoutError);
      expect((err as Error).message).toContain('KAITEN_HTTP_TIMEOUT_MS');
      expect((err as Error).message).toContain('10ms');
      expect((err as Error).message).toContain('GET');
    }
  });

  it('a request that finishes within the budget succeeds', async () => {
    const fetchImpl = (async () => delay(5, new Response('{}', { status: 200 }))) as unknown as typeof fetch;
    const client = makeClient(fetchImpl, { timeoutMs: 200 });
    await expect(client.get('/cards/1')).resolves.toEqual({});
  });

  it('no timeout configured => no AbortController regression on the happy path', async () => {
    const fetchImpl = (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    await expect(client.get('/cards/1')).resolves.toEqual({});
    await expect(client.putForm('/cards/1/files', new FormData())).resolves.toEqual({});
    const bufImpl = (async () => new Response(new TextEncoder().encode('bytes'), { status: 200 })) as unknown as typeof fetch;
    const bufClient = makeClient(bufImpl);
    const buf = await bufClient.getBuffer('/cards/1/files/2');
    expect(buf.toString('utf8')).toBe('bytes');
  });
});

describe('KaitenClient - retries', () => {
  it('GET failing with a network TypeError twice then succeeding retries and returns success (3 fetch calls)', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      if (calls <= 2) throw new TypeError('fetch failed');
      return new Response(JSON.stringify({ id: 1 }), { status: 200 });
    }) as unknown as typeof fetch;
    const client = makeClient(fetchImpl, { retries: 2 });
    await expect(client.get('/cards/1')).resolves.toEqual({ id: 1 });
    expect(calls).toBe(3);
  });

  it('GET failing with a 500 then succeeding with 200 retries and returns success', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      if (calls === 1) return new Response('server error', { status: 500 });
      return new Response(JSON.stringify({ id: 1 }), { status: 200 });
    }) as unknown as typeof fetch;
    const client = makeClient(fetchImpl, { retries: 2 });
    await expect(client.get('/cards/1')).resolves.toEqual({ id: 1 });
    expect(calls).toBe(2);
  });

  it('GET failing with a 404 is not retried - KaitenApiError propagates after 1 call', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
    }) as unknown as typeof fetch;
    const client = makeClient(fetchImpl, { retries: 3 });
    await expect(client.get('/cards/999')).rejects.toBeInstanceOf(KaitenApiError);
    expect(calls).toBe(1);
  });

  it('POST failing with a network error is never retried - exactly 1 fetch call', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const client = makeClient(fetchImpl, { retries: 3 });
    await expect(client.post('/cards', { title: 'x' })).rejects.toBeInstanceOf(TypeError);
    expect(calls).toBe(1);
  });

  it('both timeout/retries unset => single attempt, no behavior change', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    await expect(client.get('/cards/1')).rejects.toBeInstanceOf(TypeError);
    expect(calls).toBe(1);
  });

  it('getBuffer retries GET failures the same way as request()', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      if (calls === 1) throw new TypeError('fetch failed');
      return new Response(new TextEncoder().encode('bytes'), { status: 200 });
    }) as unknown as typeof fetch;
    const client = makeClient(fetchImpl, { retries: 1 });
    const buf = await client.getBuffer('/cards/1/files/2');
    expect(buf.toString('utf8')).toBe('bytes');
    expect(calls).toBe(2);
  });
});
