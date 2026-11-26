import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { healthTool } from '@/mcp/tools';

describe('kaiten_health', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.KAITEN_API_URL;
    delete process.env.KAITEN_API_TOKEN;
    delete process.env.KAITEN_CONFIG_FILE;
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it('works without credentials and never initializes an SDK', async () => {
    const result = await healthTool('4.1.0-test').handler(undefined as never, {});
    expect(result).toMatchObject({ serverVersion: '4.1.0-test', ready: false, apiUrl: { present: false }, apiToken: { present: false } });
  });

  it('normalizes the API origin and does not expose a token or URL query', async () => {
    process.env.KAITEN_API_URL = 'https://user:pass@api.example.com/v1/?access_token=nope';
    process.env.KAITEN_API_TOKEN = 'very-secret-token';
    const result = await healthTool('x').handler(undefined as never, {});
    const json = JSON.stringify(result);
    expect(result).toMatchObject({ ready: true, apiUrl: { origin: 'https://api.example.com/v1' }, apiToken: { source: 'process env' } });
    expect(json).not.toContain('very-secret-token');
    expect(json).not.toContain('access_token');
  });
});
