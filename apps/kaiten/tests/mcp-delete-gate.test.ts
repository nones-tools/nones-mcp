import { describe, expect, it } from 'bun:test';
import type { ToolContext } from '@/interfaces';
import { KaitenClient } from '@/kaiten';
import { compose, errorHook, loggingHook } from '@/mcp/hooks';
import { tools } from '@/mcp/tools';
import { KaitenSDK } from '@/sdk';

/**
 * Reproduces the exact wiring server.ts uses to run a tool call through the
 * hook chain, against a real KaitenSDK backed by a fake transport (no
 * network) - so the DELETE guidance is verified end-to-end through the same
 * error formatting the MCP client actually sees.
 */
function runTool(name: string, sdk: KaitenSDK, args: unknown) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool ${name} not found`);
  const run = compose([loggingHook, errorHook], async (ctx) => {
    const result = await tool.handler(sdk, ctx.args ?? {});
    ctx.response = { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });
  const ctx: ToolContext = { toolName: name, args };
  return run(ctx).then(() => ctx.response!);
}

/**
 * The DELETE gate is checked inside `KaitenClient.delete()` before any
 * network call is made, so `fetchImpl` here should never see a DELETE
 * request. `removeTag` does a GET first (to resolve the tag id) before
 * attempting the DELETE, so GET is stubbed to succeed; any DELETE reaching
 * fetch would mean the gate was bypassed.
 */
function makeSdkWithFetchNeverCalled(): KaitenSDK {
  const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
    if ((init?.method ?? 'GET') === 'DELETE') {
      throw new Error('fetch must not be called with DELETE when DELETE is disabled');
    }
    return new Response(JSON.stringify({ id: 1, tags: [{ id: 9, name: 'bug' }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const client = new KaitenClient({ apiUrl: 'https://api.example.com', apiToken: 'token', fetchImpl, allowDelete: false });
  return new KaitenSDK({ apiUrl: 'https://api.example.com', apiToken: 'token', client });
}

describe('MCP tools/call - DELETE gate surfaces through the error hook', () => {
  it('kaiten_delete_card returns an isError response with the DELETE-disabled guidance', async () => {
    const sdk = makeSdkWithFetchNeverCalled();
    const response = await runTool('kaiten_delete_card', sdk, { cardId: 5 });
    expect(response.isError).toBe(true);
    const text = response.content[0]!.text;
    expect(text).toContain('Tool kaiten_delete_card failed:');
    expect(text).toContain('DELETE operations are disabled for safety');
    expect(text).toContain('KAITEN_API_DELETE_ALLOW=true');
    expect(text).toContain('AI agents: do not set this variable yourself');
  });

  it('kaiten_remove_tag and kaiten_delete_checklist also surface the guidance', async () => {
    const sdk = makeSdkWithFetchNeverCalled();
    const removeTagResponse = await runTool('kaiten_remove_tag', sdk, { cardId: 1, tagName: 'bug' });
    expect(removeTagResponse.isError).toBe(true);
    expect(removeTagResponse.content[0]!.text).toContain('DELETE operations are disabled for safety');

    const deleteChecklistResponse = await runTool('kaiten_delete_checklist', sdk, { cardId: 1, checklistId: 2 });
    expect(deleteChecklistResponse.isError).toBe(true);
    expect(deleteChecklistResponse.content[0]!.text).toContain('DELETE operations are disabled for safety');
  });

  it('3.2.0: kaiten_unblock_card and kaiten_remove_external_link also surface the guidance', async () => {
    const sdk = makeSdkWithFetchNeverCalled();
    const unblockResponse = await runTool('kaiten_unblock_card', sdk, { cardId: 1, blockerId: 2 });
    expect(unblockResponse.isError).toBe(true);
    expect(unblockResponse.content[0]!.text).toContain('Tool kaiten_unblock_card failed:');
    expect(unblockResponse.content[0]!.text).toContain('DELETE operations are disabled for safety');

    const removeLinkResponse = await runTool('kaiten_remove_external_link', sdk, { cardId: 1, linkId: 2 });
    expect(removeLinkResponse.isError).toBe(true);
    expect(removeLinkResponse.content[0]!.text).toContain('Tool kaiten_remove_external_link failed:');
    expect(removeLinkResponse.content[0]!.text).toContain('DELETE operations are disabled for safety');
  });
});
