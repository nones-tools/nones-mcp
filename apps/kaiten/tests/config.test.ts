import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { inspectConfig, loadConfig, parseEnvFile } from '@/kaiten';

describe('parseEnvFile', () => {
  it('parses simple KEY=VALUE lines', () => {
    const result = parseEnvFile('KAITEN_API_URL=https://example.com\nKAITEN_API_TOKEN=abc123');
    expect(result).toEqual({ KAITEN_API_URL: 'https://example.com', KAITEN_API_TOKEN: 'abc123' });
  });

  it('ignores blank lines and comment lines', () => {
    const content = ['# a comment', '', '   ', 'KAITEN_API_URL=https://example.com', '  # another comment'].join(
      '\n'
    );
    expect(parseEnvFile(content)).toEqual({ KAITEN_API_URL: 'https://example.com' });
  });

  it('only splits on the first "=" so values may themselves contain "="', () => {
    const result = parseEnvFile('KAITEN_API_TOKEN=abc=def=ghi');
    expect(result).toEqual({ KAITEN_API_TOKEN: 'abc=def=ghi' });
  });

  it('trims whitespace around keys and values', () => {
    const result = parseEnvFile('  KAITEN_API_URL   =   https://example.com  ');
    expect(result).toEqual({ KAITEN_API_URL: 'https://example.com' });
  });

  it('skips lines without an "="', () => {
    const result = parseEnvFile('NOEQUALSHERE\nKAITEN_API_URL=https://example.com');
    expect(result).toEqual({ KAITEN_API_URL: 'https://example.com' });
  });

  it('allows an empty value after "="', () => {
    expect(parseEnvFile('KAITEN_API_URL=')).toEqual({ KAITEN_API_URL: '' });
  });

  it('returns an empty object for empty content', () => {
    expect(parseEnvFile('')).toEqual({});
  });
});

describe('loadConfig', () => {
  let tmpDir: string;
  let originalCwd: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalEnv = { ...process.env };
    // Strip all KAITEN_ vars from the real environment so file-based sources
    // (and the "missing config" case) are exercised deterministically,
    // regardless of what's set on the machine running the tests.
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('KAITEN_')) delete process.env[key];
    }
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaiten-config-test-'));
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // NOTE: the `~/.kaiten/config` layer is intentionally not exercised here —
  // loadConfig() reads it via os.homedir() with no injection point, so it
  // can't be pointed at a temp dir without editing src/kaiten/config.ts (out of
  // scope). These tests cover the layers that are controllable: process.env,
  // <cwd>/.kaiten.env, <cwd>/.env, and the `overrides` argument. This does
  // mean the "missing config" test below would spuriously pass a value if
  // the machine running the suite happens to have a real ~/.kaiten/config
  // with apiUrl/apiToken set — verified absent in this environment.

  it('throws a clear error naming both missing vars when apiUrl and apiToken are absent', () => {
    expect(() => loadConfig()).toThrow(/KAITEN_API_URL/);
    expect(() => loadConfig()).toThrow(/KAITEN_API_TOKEN/);
    expect(() => loadConfig()).toThrow(/npx -y @nones\/kaiten-mcp init/);
  });

  it('throws naming only the still-missing var when one is already set', () => {
    process.env.KAITEN_API_URL = 'https://example.com';
    try {
      loadConfig();
      throw new Error('expected loadConfig to throw');
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain('KAITEN_API_TOKEN');
      expect(message).not.toContain('KAITEN_API_URL,');
    }
  });

  it('reads config from <cwd>/.env', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.env'),
      'KAITEN_API_URL=https://from-dotenv.example\nKAITEN_API_TOKEN=dotenv-token\n'
    );
    const config = loadConfig();
    expect(config.apiUrl).toBe('https://from-dotenv.example');
    expect(config.apiToken).toBe('dotenv-token');
  });

  it('<cwd>/.kaiten.env overrides <cwd>/.env', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.env'),
      'KAITEN_API_URL=https://from-dotenv.example\nKAITEN_API_TOKEN=dotenv-token\n'
    );
    fs.writeFileSync(path.join(tmpDir, '.kaiten.env'), 'KAITEN_API_URL=https://from-kaiten-env.example\n');
    const config = loadConfig();
    expect(config.apiUrl).toBe('https://from-kaiten-env.example');
    // apiToken isn't set in .kaiten.env, so the .env value still shows through.
    expect(config.apiToken).toBe('dotenv-token');
  });

  it('process.env overrides both <cwd>/.env and <cwd>/.kaiten.env', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.env'),
      'KAITEN_API_URL=https://from-dotenv.example\nKAITEN_API_TOKEN=dotenv-token\n'
    );
    fs.writeFileSync(
      path.join(tmpDir, '.kaiten.env'),
      'KAITEN_API_URL=https://from-kaiten-env.example\nKAITEN_API_TOKEN=kaiten-env-token\n'
    );
    process.env.KAITEN_API_URL = 'https://from-process-env.example';
    const config = loadConfig();
    expect(config.apiUrl).toBe('https://from-process-env.example');
    expect(config.apiToken).toBe('kaiten-env-token');
  });

  it('uses KAITEN_CONFIG_FILE ahead of cwd files, while process env still wins', () => {
    const configFile = path.join(tmpDir, 'explicit.env');
    fs.writeFileSync(path.join(tmpDir, '.env'), 'KAITEN_API_URL=https://cwd.example\nKAITEN_API_TOKEN=cwd-secret\n');
    fs.writeFileSync(configFile, 'KAITEN_API_URL=https://explicit.example/path?token=leak\nKAITEN_API_TOKEN=explicit-secret\n');
    process.env.KAITEN_CONFIG_FILE = configFile;
    process.env.KAITEN_API_URL = 'https://process.example';
    const config = loadConfig();
    expect(config.apiUrl).toBe('https://process.example');
    expect(config.apiToken).toBe('explicit-secret');
    const health = inspectConfig();
    expect(health.apiUrl).toEqual({ present: true, source: 'process env', origin: 'https://process.example' });
    expect(health.apiToken).toEqual({ present: true, source: 'explicit config-file' });
    expect(JSON.stringify(health)).not.toContain('explicit-secret');
  });

  it('reports an unreadable explicit config file safely', () => {
    process.env.KAITEN_CONFIG_FILE = path.join(tmpDir, 'missing.env');
    expect(() => loadConfig()).toThrow(/KAITEN_CONFIG_FILE does not exist/);
    expect(inspectConfig()).toMatchObject({ ready: false, errorCode: 'INVALID_CONFIGURATION' });
  });

  it('the `overrides` argument wins over process.env and files', () => {
    process.env.KAITEN_API_URL = 'https://from-process-env.example';
    process.env.KAITEN_API_TOKEN = 'process-token';
    const config = loadConfig({ apiUrl: 'https://override.example' });
    expect(config.apiUrl).toBe('https://override.example');
    expect(config.apiToken).toBe('process-token');
  });

  it('parses KAITEN_ALLOWED_SPACE_IDS and KAITEN_ALLOWED_BOARD_IDS as CSV int lists', () => {
    process.env.KAITEN_API_URL = 'https://example.com';
    process.env.KAITEN_API_TOKEN = 'token';
    process.env.KAITEN_ALLOWED_SPACE_IDS = '1, 2,3';
    process.env.KAITEN_ALLOWED_BOARD_IDS = '10,20, 30';
    const config = loadConfig();
    expect(config.allowedSpaceIds).toEqual([1, 2, 3]);
    expect(config.allowedBoardIds).toEqual([10, 20, 30]);
  });

  it('defaults allowedSpaceIds/allowedBoardIds to null when unset', () => {
    process.env.KAITEN_API_URL = 'https://example.com';
    process.env.KAITEN_API_TOKEN = 'token';
    const config = loadConfig();
    expect(config.allowedSpaceIds).toBeNull();
    expect(config.allowedBoardIds).toBeNull();
  });

  it('parses defaultSpaceId/defaultBoardId as numbers and defaults to null', () => {
    process.env.KAITEN_API_URL = 'https://example.com';
    process.env.KAITEN_API_TOKEN = 'token';
    process.env.KAITEN_DEFAULT_SPACE_ID = '42';
    const config = loadConfig();
    expect(config.defaultSpaceId).toBe(42);
    expect(config.defaultBoardId).toBeNull();
  });

  it('defaults logLevel to "info"', () => {
    process.env.KAITEN_API_URL = 'https://example.com';
    process.env.KAITEN_API_TOKEN = 'token';
    const config = loadConfig();
    expect(config.logLevel).toBe('info');
  });

  it('reads KAITEN_LOG_LEVEL when set', () => {
    process.env.KAITEN_API_URL = 'https://example.com';
    process.env.KAITEN_API_TOKEN = 'token';
    process.env.KAITEN_LOG_LEVEL = 'debug';
    const config = loadConfig();
    expect(config.logLevel).toBe('debug');
  });
});
