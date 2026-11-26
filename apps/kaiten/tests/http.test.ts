import { describe, expect, it } from 'bun:test';
import { KaitenApiError, KaitenClient } from '@/kaiten';

// allowDelete: true by default here - this file tests the client's request
// shaping across HTTP methods, not the DELETE gate. The gate has its own
// dedicated coverage in tests/http-delete-gate.test.ts.
function makeClient(fetchImpl: typeof fetch, apiUrl = 'https://api.example.com'): KaitenClient {
  return new KaitenClient({ apiUrl, apiToken: 'test-token', fetchImpl, allowDelete: true });
}

describe('KaitenClient', () => {
  it('joins the base apiUrl and path, stripping trailing slashes from apiUrl', async () => {
    let capturedUrl = '';
    const fetchImpl = (async (input: string | URL | Request) => {
      capturedUrl = String(input);
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const client = makeClient(fetchImpl, 'https://api.example.com/');
    await client.get('/cards/1');
    expect(capturedUrl).toBe('https://api.example.com/cards/1');
  });

  it('joins a path with no leading slash correctly', async () => {
    let capturedUrl = '';
    const fetchImpl = (async (input: string | URL | Request) => {
      capturedUrl = String(input);
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    await client.get('cards/1');
    expect(capturedUrl).toBe('https://api.example.com/cards/1');
  });

  it('sends Authorization Bearer, Content-Type and Accept headers', async () => {
    let capturedInit: RequestInit | undefined;
    const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
      capturedInit = init;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    await client.get('/cards/1');
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-token');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Accept).toBe('application/json');
  });

  it('applies query params to GET requests and omits undefined values', async () => {
    let capturedUrl = '';
    const fetchImpl = (async (input: string | URL | Request) => {
      capturedUrl = String(input);
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    await client.get('/cards', { board_id: 5, archived: false, missing: undefined });
    const url = new URL(capturedUrl);
    expect(url.searchParams.get('board_id')).toBe('5');
    expect(url.searchParams.get('archived')).toBe('false');
    expect(url.searchParams.has('missing')).toBe(false);
  });

  it('serializes a JSON body for POST and uses the POST method', async () => {
    let capturedInit: RequestInit | undefined;
    const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
      capturedInit = init;
      return new Response(JSON.stringify({ id: 1 }), { status: 201 });
    }) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    const result = await client.post('/cards', { title: 'Hello' });
    expect(capturedInit?.method).toBe('POST');
    expect(capturedInit?.body).toBe(JSON.stringify({ title: 'Hello' }));
    expect(result).toEqual({ id: 1 });
  });

  it('serializes a JSON body for PATCH and uses the PATCH method', async () => {
    let capturedInit: RequestInit | undefined;
    const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
      capturedInit = init;
      return new Response(JSON.stringify({ id: 1, title: 'Updated' }), { status: 200 });
    }) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    const result = await client.patch('/cards/1', { title: 'Updated' });
    expect(capturedInit?.method).toBe('PATCH');
    expect(capturedInit?.body).toBe(JSON.stringify({ title: 'Updated' }));
    expect(result).toEqual({ id: 1, title: 'Updated' });
  });

  it('sends DELETE requests with no body', async () => {
    let capturedInit: RequestInit | undefined;
    const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
      capturedInit = init;
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    await client.delete('/cards/1');
    expect(capturedInit?.method).toBe('DELETE');
    expect(capturedInit?.body).toBeUndefined();
  });

  it('returns undefined for a 204 No Content response', async () => {
    const fetchImpl = (async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    const result = await client.delete('/cards/1');
    expect(result).toBeUndefined();
  });

  it('returns undefined for an empty-body 200 response', async () => {
    const fetchImpl = (async () => new Response('', { status: 200 })) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    const result = await client.get('/cards/1');
    expect(result).toBeUndefined();
  });

  it('throws KaitenApiError with status and parsed JSON body on a non-2xx response', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ error: 'not found' }), { status: 404 })) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    try {
      await client.get('/cards/999');
      throw new Error('expected client.get to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(KaitenApiError);
      const apiErr = err as KaitenApiError;
      expect(apiErr.status).toBe(404);
      expect(apiErr.body).toEqual({ error: 'not found' });
    }
  });

  it('falls back to the raw text body when a non-2xx response is not JSON', async () => {
    const fetchImpl = (async () => new Response('Internal Server Error', { status: 500 })) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    try {
      await client.get('/cards/1');
      throw new Error('expected client.get to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(KaitenApiError);
      const apiErr = err as KaitenApiError;
      expect(apiErr.status).toBe(500);
      expect(apiErr.body).toBe('Internal Server Error');
    }
  });

  it('sets body to undefined for an empty non-2xx response', async () => {
    const fetchImpl = (async () => new Response('', { status: 400 })) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    try {
      await client.get('/cards/1');
      throw new Error('expected client.get to throw');
    } catch (err) {
      const apiErr = err as KaitenApiError;
      expect(apiErr.status).toBe(400);
      expect(apiErr.body).toBeUndefined();
    }
  });

  it('getBuffer returns a Buffer for a successful response', async () => {
    const fetchImpl = (async () => new Response(new TextEncoder().encode('file-bytes'), { status: 200 })) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    const buf = await client.getBuffer('/cards/1/files/2');
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.toString('utf8')).toBe('file-bytes');
  });

  it('getBuffer sends GET with auth headers', async () => {
    let capturedInit: RequestInit | undefined;
    let capturedUrl = '';
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(new TextEncoder().encode('bytes'), { status: 200 });
    }) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    await client.getBuffer('/cards/1/files/2');
    expect(capturedUrl).toBe('https://api.example.com/cards/1/files/2');
    expect(capturedInit?.method).toBe('GET');
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-token');
  });

  it('getBuffer throws KaitenApiError on a non-2xx response', async () => {
    const fetchImpl = (async () => new Response('forbidden', { status: 403 })) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    try {
      await client.getBuffer('/cards/1/files/2');
      throw new Error('expected getBuffer to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(KaitenApiError);
      expect((err as KaitenApiError).status).toBe(403);
      expect((err as KaitenApiError).body).toBe('forbidden');
    }
  });

  it('putForm sends PUT with the FormData body and no Content-Type header', async () => {
    let capturedInit: RequestInit | undefined;
    let capturedUrl = '';
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({ id: 1 }), { status: 200 });
    }) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    const form = new FormData();
    form.append('file', new Blob(['x']), 'a.txt');
    const result = await client.putForm('/cards/1/files', form);
    expect(capturedUrl).toBe('https://api.example.com/cards/1/files');
    expect(capturedInit?.method).toBe('PUT');
    expect(capturedInit?.body).toBe(form);
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined();
    expect(headers.Authorization).toBe('Bearer test-token');
    expect(result).toEqual({ id: 1 });
  });

  it('putForm returns undefined for a 204 response', async () => {
    const fetchImpl = (async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    const result = await client.putForm('/cards/1/files', new FormData());
    expect(result).toBeUndefined();
  });

  it('putForm throws KaitenApiError on a non-2xx response', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ error: 'too large' }), { status: 413 })) as unknown as typeof fetch;
    const client = makeClient(fetchImpl);
    try {
      await client.putForm('/cards/1/files', new FormData());
      throw new Error('expected putForm to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(KaitenApiError);
      expect((err as KaitenApiError).status).toBe(413);
      expect((err as KaitenApiError).body).toEqual({ error: 'too large' });
    }
  });
});
