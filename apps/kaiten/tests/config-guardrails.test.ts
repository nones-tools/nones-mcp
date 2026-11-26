import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadConfig, loadConfigLenient } from '@/kaiten';

describe('loadConfig - agent guardrail fields (v3.4.0)', () => {
  let tmpDir: string;
  let originalCwd: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalEnv = { ...process.env };
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('KAITEN_')) delete process.env[key];
    }
    process.env.KAITEN_API_URL = 'https://example.com';
    process.env.KAITEN_API_TOKEN = 'token';
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaiten-config-guardrails-test-'));
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

  it('defaults all 12 new fields to their safe unset value', () => {
    const config = loadConfig();
    expect(config.allowedColumnIds).toBeNull();
    expect(config.allowedLaneIds).toBeNull();
    expect(config.protectedColumnIds).toBeNull();
    expect(config.enforceScope).toBe(false);
    expect(config.readOnly).toBe(false);
    expect(config.disabledTools).toBeNull();
    expect(config.cardsLimit).toBeNull();
    expect(config.minimalDefault).toBe(false);
    expect(config.defaultColumnId).toBeNull();
    expect(config.defaultLaneId).toBeNull();
    expect(config.httpTimeoutMs).toBeNull();
    expect(config.httpRetries).toBeNull();
  });

  it('parses all 12 fields from process.env', () => {
    process.env.KAITEN_ALLOWED_COLUMN_IDS = '1,2, 3';
    process.env.KAITEN_ALLOWED_LANE_IDS = '10, 20';
    process.env.KAITEN_PROTECTED_COLUMN_IDS = '99';
    process.env.KAITEN_ENFORCE_SCOPE = 'true';
    process.env.KAITEN_READ_ONLY = 'true';
    process.env.KAITEN_DISABLED_TOOLS = 'kaiten_delete_card, kaiten_remove_tag';
    process.env.KAITEN_CARDS_LIMIT = '50';
    process.env.KAITEN_MINIMAL_DEFAULT = 'true';
    process.env.KAITEN_DEFAULT_COLUMN_ID = '7';
    process.env.KAITEN_DEFAULT_LANE_ID = '8';
    process.env.KAITEN_HTTP_TIMEOUT_MS = '3000';
    process.env.KAITEN_HTTP_RETRIES = '2';

    const config = loadConfig();

    expect(config.allowedColumnIds).toEqual([1, 2, 3]);
    expect(config.allowedLaneIds).toEqual([10, 20]);
    expect(config.protectedColumnIds).toEqual([99]);
    expect(config.enforceScope).toBe(true);
    expect(config.readOnly).toBe(true);
    expect(config.disabledTools).toEqual(['kaiten_delete_card', 'kaiten_remove_tag']);
    expect(config.cardsLimit).toBe(50);
    expect(config.minimalDefault).toBe(true);
    expect(config.defaultColumnId).toBe(7);
    expect(config.defaultLaneId).toBe(8);
    expect(config.httpTimeoutMs).toBe(3000);
    expect(config.httpRetries).toBe(2);
  });

  it('KAITEN_HTTP_RETRIES accepts 0 (non-negative, not positive)', () => {
    process.env.KAITEN_HTTP_RETRIES = '0';
    expect(loadConfig().httpRetries).toBe(0);
  });

  it('process.env overrides <cwd>/.kaiten.env for the new fields', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.kaiten.env'),
      'KAITEN_CARDS_LIMIT=10\nKAITEN_READ_ONLY=false\nKAITEN_DISABLED_TOOLS=kaiten_a\n'
    );
    process.env.KAITEN_CARDS_LIMIT = '25';
    process.env.KAITEN_READ_ONLY = 'true';
    process.env.KAITEN_DISABLED_TOOLS = 'kaiten_b,kaiten_c';

    const config = loadConfig();

    expect(config.cardsLimit).toBe(25);
    expect(config.readOnly).toBe(true);
    expect(config.disabledTools).toEqual(['kaiten_b', 'kaiten_c']);
  });

  describe('malformed values behave as unset, never throw', () => {
    it('non-numeric int fields ("abc") -> null', () => {
      process.env.KAITEN_CARDS_LIMIT = 'abc';
      process.env.KAITEN_DEFAULT_COLUMN_ID = 'abc';
      process.env.KAITEN_HTTP_TIMEOUT_MS = 'abc';
      process.env.KAITEN_HTTP_RETRIES = 'abc';
      const config = loadConfig();
      expect(config.cardsLimit).toBeNull();
      expect(config.defaultColumnId).toBeNull();
      expect(config.httpTimeoutMs).toBeNull();
      expect(config.httpRetries).toBeNull();
    });

    it('negative numbers ("-5") -> null for positive-int fields, and for non-negative-int fields too', () => {
      process.env.KAITEN_CARDS_LIMIT = '-5';
      process.env.KAITEN_DEFAULT_COLUMN_ID = '-5';
      process.env.KAITEN_HTTP_TIMEOUT_MS = '-5';
      process.env.KAITEN_HTTP_RETRIES = '-5';
      const config = loadConfig();
      expect(config.cardsLimit).toBeNull();
      expect(config.defaultColumnId).toBeNull();
      expect(config.httpTimeoutMs).toBeNull();
      expect(config.httpRetries).toBeNull();
    });

    it('empty string -> null/false, same as unset', () => {
      process.env.KAITEN_CARDS_LIMIT = '';
      process.env.KAITEN_ALLOWED_COLUMN_IDS = '';
      process.env.KAITEN_DISABLED_TOOLS = '';
      process.env.KAITEN_READ_ONLY = '';
      const config = loadConfig();
      expect(config.cardsLimit).toBeNull();
      expect(config.allowedColumnIds).toBeNull();
      expect(config.disabledTools).toBeNull();
      expect(config.readOnly).toBe(false);
    });

    it('garbage-only CSV (",,") -> null, never "allow nothing" ([])', () => {
      process.env.KAITEN_ALLOWED_COLUMN_IDS = ',,';
      process.env.KAITEN_DISABLED_TOOLS = ',,';
      const config = loadConfig();
      expect(config.allowedColumnIds).toBeNull();
      expect(config.disabledTools).toBeNull();
    });

    it('partially malformed CSV drops only the bad entries', () => {
      process.env.KAITEN_ALLOWED_COLUMN_IDS = '1,abc,3';
      const config = loadConfig();
      expect(config.allowedColumnIds).toEqual([1, 3]);
    });
  });

  describe('boolean flags: exact "true" (trimmed, case-insensitive) only', () => {
    it('"TRUE " with trailing whitespace is valid (trimmed)', () => {
      process.env.KAITEN_ENFORCE_SCOPE = 'TRUE ';
      expect(loadConfig().enforceScope).toBe(true);
    });

    it('"yes" is not valid', () => {
      process.env.KAITEN_READ_ONLY = 'yes';
      expect(loadConfig().readOnly).toBe(false);
    });

    it('"1" is not valid', () => {
      process.env.KAITEN_MINIMAL_DEFAULT = '1';
      expect(loadConfig().minimalDefault).toBe(false);
    });
  });

  it('loadConfigLenient returns a config without throwing when credentials are missing', () => {
    delete process.env.KAITEN_API_URL;
    delete process.env.KAITEN_API_TOKEN;
    process.env.KAITEN_DISABLED_TOOLS = 'kaiten_delete_card';

    const config = loadConfigLenient();

    expect(config.apiUrl).toBe('');
    expect(config.apiToken).toBe('');
    expect(config.disabledTools).toEqual(['kaiten_delete_card']);
  });

  it('loadConfig still throws when credentials are missing (loadConfigLenient does not change loadConfig)', () => {
    delete process.env.KAITEN_API_URL;
    delete process.env.KAITEN_API_TOKEN;
    expect(() => loadConfig()).toThrow(/KAITEN_API_URL/);
    expect(() => loadConfig()).toThrow(/KAITEN_API_TOKEN/);
  });

  it('the `overrides` argument wins over process.env for the new fields', () => {
    process.env.KAITEN_READ_ONLY = 'true';
    const config = loadConfig({ readOnly: false });
    expect(config.readOnly).toBe(false);
  });
});
