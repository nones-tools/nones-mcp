import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '@/mcp/bootstrap';

describe('MCP tools/list task support', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    for (const key of Object.keys(process.env)) if (key.startsWith('KAITEN_')) delete process.env[key];
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it('lists every tool without credentials for Codex task chats', async () => {
    const server = createMcpServer();
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const result = await client.listTools();

    expect(result.tools.length).toBeGreaterThan(0);
    expect(result.tools.every((tool) => tool.execution?.taskSupport === 'optional')).toBe(true);
    expect(result.tools.find((tool) => tool.name === 'kaiten_spaces')?.annotations).toMatchObject({ readOnlyHint: true });
    expect(result.tools.find((tool) => tool.name === 'kaiten_delete_card')?.annotations).toMatchObject({ destructiveHint: true });
    expect(result.tools.find((tool) => tool.name === 'kaiten_create_card')?.inputSchema).toMatchObject({
      properties: { title: { type: 'string' }, boardId: { type: 'number' } }, required: ['title', 'boardId'],
    });

    await Promise.all([client.close(), server.close()]);
  });
});
