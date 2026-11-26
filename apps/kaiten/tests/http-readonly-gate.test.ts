import { describe, expect, it } from 'bun:test';
import { KaitenClient, KaitenReadOnlyError } from '@/kaiten';

function makeClient(fetchImpl: typeof fetch, readOnly?: boolean, allowDelete?: boolean): KaitenClient {
  return new KaitenClient({ apiUrl: 'https://api.example.com', apiToken: 'test-token', fetchImpl, readOnly, allowDelete });
}

describe('KaitenClient - read-only gate', () => {
  it('post throws KaitenReadOnlyError and never calls fetch when readOnly is true', async () => {
    let fetchCalled = false;
    const fetchImpl = (async () => {
      fetchCalled = true;
      return new Response(JSON.stringify({ id: 1 }), { status: 201 });
    }) as unknown as typeof fetch;
    const client = makeClient(fetchImpl, true);
    await expect(client.post('/cards', { title: 'x' })).rejects.toBeInstanceOf(KaitenReadOnlyError);
    expect(fetchCalled).toBe(false);
  });

  it('patch throws KaitenReadOnlyError and never calls fetch when readOnly is true', async () => {
    let fetchCalled = false;
    const fetchImpl = (async () => {
      fetchCalled = true;
      return new Response(JSON.stringify({ id: 1 }), { status: 200 });
    }) as unknown as typeof fetch;
    const client = makeClient(fetchImpl, true);
    await expect(client.patch('/cards/1', { title: 'x' })).rejects.toBeInstanceOf(KaitenReadOnlyError);
    expect(fetchCalled).toBe(false);
  });

  it('putForm throws KaitenReadOnlyError and never calls fetch when readOnly is true', async () => {
    let fetchCalled = false;
    const fetchImpl = (async () => {
      fetchCalled = true;
      return new Response(JSON.stringify({ id: 1 }), { status: 200 });
    }) as unknown as typeof fetch;
    const client = makeClient(fetchImpl, true);
    await expect(client.putForm('/cards/1/files', new FormData())).rejects.toBeInstanceOf(KaitenReadOnlyError);
    expect(fetchCalled).toBe(false);
  });

  it('delete throws KaitenReadOnlyError and never calls fetch when readOnly is true, even with allowDelete true', async () => {
    let fetchCalled = false;
    const fetchImpl = (async () => {
      fetchCalled = true;
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;
    const client = makeClient(fetchImpl, true, true);
    await expect(client.delete('/cards/1')).rejects.toBeInstanceOf(KaitenReadOnlyError);
    expect(fetchCalled).toBe(false);
  });

  it('the error message names KAITEN_READ_ONLY and tells agents to relay it, not set it', async () => {
    const fetchImpl = (async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
    const client = makeClient(fetchImpl, true);
    try {
      await client.post('/cards', {});
      throw new Error('expected client.post to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(KaitenReadOnlyError);
      const message = (err as Error).message;
      expect(message).toContain('KAITEN_READ_ONLY');
      expect(message).toContain('AI agents: do not set or change this variable yourself');
    }
  });

  it('get is unaffected by readOnly', async () => {
    const fetchImpl = (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    const client = makeClient(fetchImpl, true);
    await expect(client.get('/cards/1')).resolves.toEqual({});
  });

  it('getBuffer is unaffected by readOnly', async () => {
    const fetchImpl = (async () => new Response(new TextEncoder().encode('bytes'), { status: 200 })) as unknown as typeof fetch;
    const client = makeClient(fetchImpl, true);
    const buf = await client.getBuffer('/cards/1/files/2');
    expect(buf.toString('utf8')).toBe('bytes');
  });

  it('writes pass through when readOnly is false/unset', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ id: 1 }), { status: 201 })) as unknown as typeof fetch;
    const clientUnset = makeClient(fetchImpl);
    const clientFalse = makeClient(fetchImpl, false);
    await expect(clientUnset.post('/cards', { title: 'x' })).resolves.toEqual({ id: 1 });
    await expect(clientFalse.post('/cards', { title: 'x' })).resolves.toEqual({ id: 1 });
  });
});
