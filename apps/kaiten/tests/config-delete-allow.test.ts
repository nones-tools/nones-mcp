import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadConfig } from '@/kaiten';

describe('loadConfig - KAITEN_API_DELETE_ALLOW parsing', () => {
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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaiten-config-delete-test-'));
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

  it('defaults deleteAllow to false when KAITEN_API_DELETE_ALLOW is absent', () => {
    expect(loadConfig().deleteAllow).toBe(false);
  });

  it('is true for the exact string "true"', () => {
    process.env.KAITEN_API_DELETE_ALLOW = 'true';
    expect(loadConfig().deleteAllow).toBe(true);
  });

  it('is true for "TRUE" (case-insensitive)', () => {
    process.env.KAITEN_API_DELETE_ALLOW = 'TRUE';
    expect(loadConfig().deleteAllow).toBe(true);
  });

  it('is true for "True" (mixed case)', () => {
    process.env.KAITEN_API_DELETE_ALLOW = 'True';
    expect(loadConfig().deleteAllow).toBe(true);
  });

  it('is false for the string "false"', () => {
    process.env.KAITEN_API_DELETE_ALLOW = 'false';
    expect(loadConfig().deleteAllow).toBe(false);
  });

  it('is false for garbage values like "1" or "yes"', () => {
    process.env.KAITEN_API_DELETE_ALLOW = '1';
    expect(loadConfig().deleteAllow).toBe(false);
    process.env.KAITEN_API_DELETE_ALLOW = 'yes';
    expect(loadConfig().deleteAllow).toBe(false);
  });

  it('is false for an empty string', () => {
    process.env.KAITEN_API_DELETE_ALLOW = '';
    expect(loadConfig().deleteAllow).toBe(false);
  });

  it('is not required - loadConfig succeeds without it and does not affect the missing-config error', () => {
    delete process.env.KAITEN_API_TOKEN;
    expect(() => loadConfig()).toThrow(/KAITEN_API_TOKEN/);
    expect(() => loadConfig()).not.toThrow(/KAITEN_API_DELETE_ALLOW/);
  });

  it('is readable from <cwd>/.kaiten.env like other KAITEN_ vars', () => {
    fs.writeFileSync(path.join(tmpDir, '.kaiten.env'), 'KAITEN_API_DELETE_ALLOW=true\n');
    expect(loadConfig().deleteAllow).toBe(true);
  });

  it('the `overrides` argument wins over process.env', () => {
    process.env.KAITEN_API_DELETE_ALLOW = 'true';
    expect(loadConfig({ deleteAllow: false }).deleteAllow).toBe(false);
  });
});
