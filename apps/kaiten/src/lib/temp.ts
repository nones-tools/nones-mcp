import fs from 'fs/promises';
import path from 'path';

const BASE_TEMP_DIR = process.env.KAITEN_TEMP_DIR || '/tmp/kaiten';

export function getCardTempDir(cardId: number | string): string {
  return path.join(BASE_TEMP_DIR, String(cardId));
}

export async function ensureTempDir(cardId: number | string): Promise<string> {
  const dir = getCardTempDir(cardId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Cleans a temp directory. `cardId` null cleans the whole base temp dir.
 * Returns the number of entries (files or top-level dir entries) removed.
 */
export async function cleanTempDir(cardId: number | string | null = null): Promise<number> {
  const targetDir = cardId !== null ? getCardTempDir(cardId) : BASE_TEMP_DIR;

  try {
    await fs.access(targetDir);
  } catch {
    return 0;
  }

  let deletedCount = 0;

  if (cardId !== null) {
    const files = await fs.readdir(targetDir);
    for (const file of files) {
      const filePath = path.join(targetDir, file);
      await fs.unlink(filePath);
      deletedCount++;
    }
    try {
      await fs.rmdir(targetDir);
    } catch {
      // Ignore if already removed or not empty.
    }
  } else {
    const entries = await fs.readdir(targetDir);
    for (const entry of entries) {
      const entryPath = path.join(targetDir, entry);
      const stat = await fs.stat(entryPath);
      if (stat.isDirectory()) {
        await fs.rm(entryPath, { recursive: true, force: true });
      } else {
        await fs.unlink(entryPath);
      }
      deletedCount++;
    }
  }

  return deletedCount;
}
