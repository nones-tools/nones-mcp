import { describe, expect, it } from 'bun:test';
import { KaitenReadOnlyError } from '@/kaiten';
import { KaitenSDK } from '@/sdk';

describe('KaitenSDK - read-only gate integration', () => {
  it('addComment rejects with KaitenReadOnlyError when the SDK builds its own client (readOnly: true)', async () => {
    const sdk = new KaitenSDK({
      apiUrl: 'https://api.example.com',
      apiToken: 'token',
      readOnly: true,
    });
    await expect(sdk.addComment(5, 'hi')).rejects.toBeInstanceOf(KaitenReadOnlyError);
  });

  it('addComment rejection message tells agents to relay it to the user', async () => {
    const sdk = new KaitenSDK({ apiUrl: 'https://api.example.com', apiToken: 'token', readOnly: true });
    try {
      await sdk.addComment(5, 'hi');
      throw new Error('expected sdk.addComment to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(KaitenReadOnlyError);
      expect((err as Error).message).toContain('KAITEN_READ_ONLY');
    }
  });

  it('createCard/updateCard/deleteCard all reject the same way in read-only mode', async () => {
    const sdk = new KaitenSDK({ apiUrl: 'https://api.example.com', apiToken: 'token', readOnly: true });
    await expect(sdk.createCard({ boardId: 1, title: 'x', columnId: 1 })).rejects.toBeInstanceOf(KaitenReadOnlyError);
    await expect(sdk.updateCard(1, { title: 'x' })).rejects.toBeInstanceOf(KaitenReadOnlyError);
    await expect(sdk.deleteCard(1)).rejects.toBeInstanceOf(KaitenReadOnlyError);
  });

  it('read-only wins even when deleteAllow is also true', async () => {
    const sdk = new KaitenSDK({ apiUrl: 'https://api.example.com', apiToken: 'token', readOnly: true, deleteAllow: true });
    await expect(sdk.deleteCard(5)).rejects.toBeInstanceOf(KaitenReadOnlyError);
  });

  it('read tools still work when readOnly is true (stubbed transport)', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ id: 1, title: 'card' }), { status: 200 })) as unknown as typeof fetch;
    const { KaitenClient } = await import('@/kaiten');
    const client = new KaitenClient({ apiUrl: 'https://api.example.com', apiToken: 'token', fetchImpl, readOnly: true });
    const sdk = new KaitenSDK({ apiUrl: 'https://api.example.com', apiToken: 'token', client });
    const card = await sdk.getCard(1, false);
    expect((card as { id: number }).id).toBe(1);
  });

  it('non-read-only SDK instance still writes normally', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ id: 1 }), { status: 200 })) as unknown as typeof fetch;
    const { KaitenClient } = await import('@/kaiten');
    const client = new KaitenClient({ apiUrl: 'https://api.example.com', apiToken: 'token', fetchImpl });
    const sdk = new KaitenSDK({ apiUrl: 'https://api.example.com', apiToken: 'token', client });
    await expect(sdk.addComment(5, 'hi')).resolves.toEqual({ id: 1 });
  });
});
