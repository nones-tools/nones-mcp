import { describe, expect, it } from 'bun:test';
import { KaitenClient, KaitenDeleteDisabledError } from '@/kaiten';
import { KaitenSDK } from '@/sdk';

interface Call {
  method: string;
  url: string;
}

function createFakeFetch(responses: { status?: number; body?: unknown }[]) {
  const calls: Call[] = [];
  let i = 0;
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ method: init?.method ?? 'GET', url: String(input) });
    const canned = responses[i++];
    if (!canned) throw new Error(`no canned response for call #${i}`);
    return new Response(canned.body !== undefined ? JSON.stringify(canned.body) : '', { status: canned.status ?? 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe('KaitenSDK - DELETE gate integration', () => {
  it('deleteCard rejects with KaitenDeleteDisabledError when the SDK builds its own client (deleteAllow: false)', async () => {
    const sdk = new KaitenSDK({
      apiUrl: 'https://api.example.com',
      apiToken: 'token',
      deleteAllow: false,
    });
    await expect(sdk.deleteCard(5)).rejects.toBeInstanceOf(KaitenDeleteDisabledError);
  });

  it('deleteCard rejection message tells agents to relay it to the user', async () => {
    const sdk = new KaitenSDK({ apiUrl: 'https://api.example.com', apiToken: 'token', deleteAllow: false });
    try {
      await sdk.deleteCard(5);
      throw new Error('expected sdk.deleteCard to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(KaitenDeleteDisabledError);
      expect((err as Error).message).toContain('KAITEN_API_DELETE_ALLOW=true');
    }
  });

  it('deleteChecklist/deleteComment reject the same way (no GET precedes their DELETE)', async () => {
    const sdk = new KaitenSDK({ apiUrl: 'https://api.example.com', apiToken: 'token', deleteAllow: false });
    await expect(sdk.deleteChecklist(1, 2)).rejects.toBeInstanceOf(KaitenDeleteDisabledError);
    await expect(sdk.deleteComment(3)).rejects.toBeInstanceOf(KaitenDeleteDisabledError);
  });

  it('3.2.0: unblockCard/removeExternalLink reject the same way (no GET precedes their DELETE)', async () => {
    const sdk = new KaitenSDK({ apiUrl: 'https://api.example.com', apiToken: 'token', deleteAllow: false });
    await expect(sdk.unblockCard(1, 2)).rejects.toBeInstanceOf(KaitenDeleteDisabledError);
    await expect(sdk.removeExternalLink(1, 2)).rejects.toBeInstanceOf(KaitenDeleteDisabledError);
  });

  it('detachFromParent rejects the same way (its GET-then-DELETE flow is stubbed, no real network)', async () => {
    // detachFromParent GETs the parent card before deleting the link - stub
    // that GET so this test never hits the network even though the SDK
    // builds its own client from config (deleteAllow: false).
    const { fetchImpl } = createFakeFetch([{ body: { id: 4, parent_link_ids: [1] } }, { body: { id: 1 } }]);
    const client = new KaitenClient({ apiUrl: 'https://api.example.com', apiToken: 'token', fetchImpl, allowDelete: false });
    const sdk = new KaitenSDK({ apiUrl: 'https://api.example.com', apiToken: 'token', client });
    await expect(sdk.detachFromParent(4)).rejects.toBeInstanceOf(KaitenDeleteDisabledError);
  });

  it('deleteCard performs the DELETE when given a client with allowDelete: true (stubbed transport)', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ status: 204 }]);
    const client = new KaitenClient({ apiUrl: 'https://api.example.com', apiToken: 'token', fetchImpl, allowDelete: true });
    const sdk = new KaitenSDK({ apiUrl: 'https://api.example.com', apiToken: 'token', client });
    await sdk.deleteCard(5);
    expect(calls).toEqual([{ method: 'DELETE', url: 'https://api.example.com/cards/5' }]);
  });

  it('non-DELETE SDK methods still work when deleteAllow is false', async () => {
    const { fetchImpl, calls } = createFakeFetch([{ body: { id: 1, title: 'card' } }]);
    const client = new KaitenClient({ apiUrl: 'https://api.example.com', apiToken: 'token', fetchImpl, allowDelete: false });
    const sdk = new KaitenSDK({ apiUrl: 'https://api.example.com', apiToken: 'token', client });
    const card = await sdk.getCard(1, false);
    expect(calls[0]!.method).toBe('GET');
    expect((card as { id: number }).id).toBe(1);
  });
});
