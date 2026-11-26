import { describe, expect, it } from 'bun:test';
import type { ToolContext } from '@/interfaces';
import { KaitenClient } from '@/kaiten';
import { compose, errorHook, loggingHook } from '@/mcp/hooks';
import { tools } from '@/mcp/tools';
import { KaitenSDK } from '@/sdk';

/**
 * Runs a tool call through the exact same hook chain server.ts uses, so a
 * missing local file surfaces as a clean `isError` MCP response through
 * `errorHook` rather than an uncaught rejection crashing the server.
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

describe('kaiten_attach_file - missing file surfaces a clean error, never a crash', () => {
  it('returns an isError response naming the tool, instead of throwing past the hook chain', async () => {
    // fetch must never be called - the handler should fail while reading the
    // local file, before any HTTP request is made.
    const fetchImpl = (async () => {
      throw new Error('fetch must not be called when the local file is missing');
    }) as unknown as typeof fetch;
    const client = new KaitenClient({ apiUrl: 'https://api.example.com', apiToken: 'token', fetchImpl });
    const sdk = new KaitenSDK({ apiUrl: 'https://api.example.com', apiToken: 'token', client });

    const response = await runTool('kaiten_attach_file', sdk, {
      cardId: 5,
      filePath: '/nonexistent/path/does-not-exist.txt',
    });

    expect(response.isError).toBe(true);
    expect(response.content[0]!.text).toContain('Tool kaiten_attach_file failed:');
    expect(response.content[0]!.text).toMatch(/ENOENT|no such file/i);
  });
});
