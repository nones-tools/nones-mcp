import { afterEach, describe, expect, it } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getGlobalConfigPath, saveGlobalCredentials } from '@/lib/config-init';

const tempDirs: string[] = [];

function makeConfigPath(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'kaiten-init-test-'));
  tempDirs.push(home);
  return getGlobalConfigPath(home);
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('saveGlobalCredentials', () => {
  it('creates ~/.kaiten/config with only the supplied credentials', () => {
    const filePath = makeConfigPath();
    saveGlobalCredentials({ apiUrl: 'https://team.kaiten.ru/api/latest', apiToken: 'secret' }, filePath);

    expect(fs.readFileSync(filePath, 'utf8')).toBe(
      'KAITEN_API_URL=https://team.kaiten.ru/api/latest\nKAITEN_API_TOKEN=secret\n'
    );
    if (process.platform !== 'win32') expect(fs.statSync(filePath).mode & 0o777).toBe(0o600);
  });

  it('updates credentials while preserving defaults, guardrails and comments', () => {
    const filePath = makeConfigPath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      '# existing settings\nKAITEN_API_TOKEN=old\nKAITEN_READ_ONLY=true\nKAITEN_API_TOKEN=duplicate\n'
    );

    saveGlobalCredentials({ apiUrl: 'https://new.example/api/latest', apiToken: 'new' }, filePath);

    expect(fs.readFileSync(filePath, 'utf8')).toBe(
      '# existing settings\nKAITEN_API_TOKEN=new\nKAITEN_READ_ONLY=true\nKAITEN_API_URL=https://new.example/api/latest\n'
    );
  });

  it('rejects newline injection without creating a config file', () => {
    const filePath = makeConfigPath();
    expect(() =>
      saveGlobalCredentials({ apiUrl: 'https://example.com\nKAITEN_READ_ONLY=false', apiToken: 'secret' }, filePath)
    ).toThrow('must not contain newlines');
    expect(fs.existsSync(filePath)).toBe(false);
  });
});
