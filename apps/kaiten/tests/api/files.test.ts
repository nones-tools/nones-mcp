import { describe, expect, it } from 'bun:test';
import { FilesApi, KaitenClient } from '@/kaiten';
import { createFakeFetch, makeClient, type Call } from './helpers';

describe('FilesApi', () => {
  it('getCardFiles GETs /cards/{id}/files', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: [] }]);
    const api = new FilesApi(makeClient(fetchImpl));
    await api.getCardFiles(5);
    expect(calls[0]!.url).toBe('https://api.example.com/cards/5/files');
  });

  it('downloadFile GETs /cards/{id}/files/{fileId} and returns a Buffer', async () => {
    const calls: Call[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', url: String(input), body: undefined });
      return new Response(new TextEncoder().encode('file-contents'), { status: 200 });
    }) as unknown as typeof fetch;
    const api = new FilesApi(makeClient(fetchImpl));
    const buf = await api.downloadFile(5, 9);
    expect(calls[0]!.url).toBe('https://api.example.com/cards/5/files/9');
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.toString()).toBe('file-contents');
  });

  it('attachFile PUTs /cards/{id}/files with a FormData body and no Content-Type header', async () => {
    let capturedInit: RequestInit | undefined;
    let capturedUrl = '';
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({ id: 1, name: 'report.txt' }), { status: 200 });
    }) as unknown as typeof fetch;
    const client = new KaitenClient({ apiUrl: 'https://api.example.com', apiToken: 'token', fetchImpl });
    const api = new FilesApi(client);

    const form = new FormData();
    form.append('file', new Blob(['hello']), 'report.txt');
    const result = await api.attachFile(5, form);

    expect(capturedUrl).toBe('https://api.example.com/cards/5/files');
    expect(capturedInit?.method).toBe('PUT');
    expect(capturedInit?.body).toBeInstanceOf(FormData);
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined();
    expect(headers.Authorization).toBe('Bearer token');
    expect(result).toEqual({ id: 1, name: 'report.txt' });
  });
});
