import { describe, expect, it } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import { cleanTempDir, getCardTempDir } from '@/lib';

// NOTE on KAITEN_TEMP_DIR: src/lib/temp.ts reads process.env.KAITEN_TEMP_DIR
// into a module-level constant at import time. Verified empirically that
// bun:test shares a single ES module cache across all test files in a run,
// so setting KAITEN_TEMP_DIR before a dynamic import() only works if this is
// the very first file (in any test run) to import '@/lib/temp.js' - not something
// this file can guarantee given other test files may import it first
// (directly, or transitively via sdk.ts). These tests therefore exercise the
// real default base dir (`/tmp/kaiten`) and rely on unique per-test cardIds
// for isolation instead of trying to override the base dir.

function uniqueCardId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

describe('getCardTempDir', () => {
  it('joins the base temp dir with the card id', () => {
    const cardId = 12345;
    const dir = getCardTempDir(cardId);
    expect(dir).toBe(path.join('/tmp/kaiten', '12345'));
    expect(dir.endsWith(`${path.sep}12345`)).toBe(true);
  });

  it('accepts a string card id', () => {
    const dir = getCardTempDir('abc');
    expect(dir).toBe(path.join('/tmp/kaiten', 'abc'));
  });
});

describe('cleanTempDir', () => {
  it('returns 0 when the target directory does not exist', async () => {
    const count = await cleanTempDir(uniqueCardId());
    expect(count).toBe(0);
  });

  it('deletes every file directly inside a card temp dir and returns the count', async () => {
    const cardId = uniqueCardId();
    const dir = getCardTempDir(cardId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'a.txt'), 'a');
    await fs.writeFile(path.join(dir, 'b.txt'), 'b');
    await fs.writeFile(path.join(dir, 'c.txt'), 'c');

    const count = await cleanTempDir(cardId);
    expect(count).toBe(3);

    // The now-empty card dir itself is removed as well.
    const exists = await fs
      .access(dir)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });

  it('returns 0 for a card dir that already exists but is empty, and removes it', async () => {
    const cardId = uniqueCardId();
    const dir = getCardTempDir(cardId);
    await fs.mkdir(dir, { recursive: true });

    const count = await cleanTempDir(cardId);
    expect(count).toBe(0);

    const exists = await fs
      .access(dir)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });
});
