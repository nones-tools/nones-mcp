import { KaitenClient } from '@/kaiten';

export interface Canned {
  status?: number;
  body?: unknown;
}

export interface Call {
  method: string;
  url: string;
  body: unknown;
}

/** Fake fetch that serves canned responses in order and records every call made. */
export function createFakeFetch(responses: Canned[]) {
  const calls: Call[] = [];
  let i = 0;
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const url = String(input);
    const body = init?.body !== undefined ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, url, body });
    const canned = responses[i++];
    if (!canned) {
      throw new Error(`createFakeFetch: no canned response queued for call #${i}: ${method} ${url}`);
    }
    return new Response(canned.body !== undefined ? JSON.stringify(canned.body) : '', {
      status: canned.status ?? 200,
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

/**
 * `allowDelete: true` by default - these API-layer tests exercise request
 * shaping (paths, methods, bodies) on the resource classes, not the DELETE
 * gate itself. The gate has its own dedicated coverage in
 * tests/http-delete-gate.test.ts, tests/sdk-delete-gate.test.ts and
 * tests/mcp-delete-gate.test.ts.
 */
export function makeClient(fetchImpl: typeof fetch): KaitenClient {
  return new KaitenClient({ apiUrl: 'https://api.example.com', apiToken: 'token', fetchImpl, allowDelete: true });
}
