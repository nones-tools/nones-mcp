import { afterAll, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import type { ModuleContext } from '@nones/mcp-core';
import { module as kaitenModule } from '@/mcp/module';

const stateRoot = path.join(process.cwd(), '..', '..', '.tmp', 'tests');
await mkdir(stateRoot, { recursive: true });
const stateDir = await mkdtemp(path.join(stateRoot, 'kaiten-module-'));

afterAll(async () => {
  await rm(stateDir, { recursive: true, force: true });
});

function context(env: Record<string, string>, permissions = { destructive: false, admin: false, exec: false }): ModuleContext {
  return {
    id: 'kaiten',
    version: '4.3.0',
    config: { version: 1, enabled: true, permissions, env: {}, envFrom: {}, options: {} },
    env: Object.freeze(env),
    shared: { logLevel: 'error', moduleId: 'kaiten' },
    journal: Object.freeze({ enabled: false, capturePrompts: false, configDirectory: stateDir, configPath: null, sqlitePath: null, adapter: null }),
    stateDir,
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    signal: new AbortController().signal,
  };
}

describe('source-owned kaiten module', () => {
  it('exposes the versioned module contract without reading env at import time', () => {
    expect(kaitenModule.apiVersion).toBe(1);
    expect(kaitenModule.id).toBe('kaiten');
    expect(kaitenModule.version).toBe('4.3.0');
    expect(kaitenModule.host).toEqual({ name: '@nones/kaiten-mcp', version: '4.3.0' });
  });

  it('discovers every tool with optional taskSupport and does not touch process.env', async () => {
    const before = JSON.stringify(process.env);
    process.env.KAITEN_API_URL = 'https://ambient.invalid';
    const runtime = await kaitenModule.start(context({ KAITEN_API_URL: 'http://127.0.0.1:9/api/latest', KAITEN_API_TOKEN: 'scoped-token-123' }));
    try {
      expect(runtime.tools).toHaveLength(60);
      expect(runtime.tools.every((tool) => tool.definition.execution?.taskSupport === 'optional')).toBe(true);
      expect(runtime.tools.find((tool) => tool.definition.name === 'kaiten_delete_card')?.definition.annotations).toMatchObject({
        destructiveHint: true,
      });
      const health = runtime.tools.find((tool) => tool.definition.name === 'kaiten_health');
      const result = await health?.call({}, { signal: new AbortController().signal });
      const text = (result?.content[0] as { text?: string } | undefined)?.text ?? '';
      const report = JSON.parse(text);
      expect(report.apiUrl.source).toBe('module config');
      expect(report.apiUrl.origin).toBe('http://127.0.0.1:9/api/latest');
      expect(report.ready).toBe(true);
      expect(JSON.stringify(report)).not.toContain('scoped-token-123');
    } finally {
      await runtime.close();
      delete process.env.KAITEN_API_URL;
      expect(JSON.parse(before).KAITEN_API_URL).toBe(process.env.KAITEN_API_URL);
    }
  });

  it('rejects unsupported permissions and options before registering tools', async () => {
    await expect(
      kaitenModule.start(context({}, { destructive: false, admin: true, exec: false }))
    ).rejects.toThrow(/does not support permission admin/);
    const withOptions = context({});
    withOptions.config.options = { unsafe: true };
    await expect(kaitenModule.start(withOptions)).rejects.toThrow(/does not accept options/);
  });

  it('enforces fail-closed delete permission over the scoped env', async () => {
    const runtime = await kaitenModule.start(
      context(
        { KAITEN_API_URL: 'http://127.0.0.1:9/api/latest', KAITEN_API_TOKEN: 't', KAITEN_API_DELETE_ALLOW: 'true' },
        { destructive: false, admin: false, exec: false }
      )
    );
    try {
      const health = runtime.tools.find((tool) => tool.definition.name === 'kaiten_health');
      expect(health).toBeDefined();
      // destructive stays off: a DELETE call must not reach the API.
      const deleteCard = runtime.tools.find((tool) => tool.definition.name === 'kaiten_delete_card');
      const result = await deleteCard?.call({ cardId: 1 }, { signal: new AbortController().signal });
      expect(result?.isError).toBe(true);
      const text = (result?.content[0] as { text?: string } | undefined)?.text ?? '';
      expect(text).toContain('DELETE operations are disabled');
    } finally {
      await runtime.close();
    }
  });
});
