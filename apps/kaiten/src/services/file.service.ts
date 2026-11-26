import fs from 'fs/promises';
import path from 'path';
import { inject, injectable } from 'inversify';
import type { CardFile, KaitenApiPort } from '../kaiten';
import { cleanTempDir as cleanTempDirFs, getCardTempDir } from '../lib';
import { TOKENS } from '../di/tokens';
import type { AccessGuard } from './guard';

@injectable()
export class FileService {
  constructor(
    @inject(TOKENS.KaitenApi) private readonly api: KaitenApiPort,
    @inject(TOKENS.AccessGuard) private readonly guard: AccessGuard
  ) {}

  async getCardFiles(cardId: number): Promise<CardFile[]> {
    await this.guard.validateCardId(cardId);
    return this.api.files.getCardFiles(cardId);
  }

  async downloadFile(cardId: number, fileId: number): Promise<Buffer> {
    await this.guard.validateCardId(cardId);
    return this.api.files.downloadFile(cardId, fileId);
  }

  async downloadFileToDisk(
    cardId: number,
    fileId: number,
    outputDir: string | null = null
  ): Promise<{ path: string; filename: string; size: number }> {
    await this.guard.validateCardId(cardId);
    const fileData = await this.downloadFile(cardId, fileId);
    const files = await this.getCardFiles(cardId);
    const file = files.find((f) => f.id === fileId);
    const filename = file?.name || `file-${fileId}`;
    const dir = outputDir || getCardTempDir(cardId);

    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, filename);
    await fs.writeFile(filePath, fileData);

    return { path: filePath, filename, size: fileData.length };
  }

  async downloadAllCardFiles(
    cardId: number,
    outputDir: string | null = null
  ): Promise<Array<{ path: string; filename: string; size: number; id: number }>> {
    await this.guard.validateCardId(cardId);
    const files = await this.getCardFiles(cardId);
    const dir = outputDir || getCardTempDir(cardId);

    await fs.mkdir(dir, { recursive: true });

    const results: Array<{ path: string; filename: string; size: number; id: number }> = [];
    for (const file of files) {
      const result = await this.downloadFileToDisk(cardId, file.id, dir);
      results.push({ ...result, id: file.id });
    }
    return results;
  }

  cleanTempDir(cardId: number | null = null): Promise<number> {
    return cleanTempDirFs(cardId);
  }

  /**
   * Reads a local file and uploads it as the card's attachment. Errors
   * (e.g. `ENOENT` for a missing `filePath`) propagate as plain `Error`s -
   * the MCP error hook formats them into the standard
   * `Tool kaiten_attach_file failed: ...` response, never an uncaught crash.
   */
  async attachFile(cardId: number, filePath: string, fileName?: string): Promise<CardFile> {
    await this.guard.validateCardId(cardId);
    const data = await fs.readFile(filePath);
    const name = fileName ?? path.basename(filePath);
    const form = new FormData();
    form.append('file', new Blob([data]), name);
    return this.api.files.attachFile(cardId, form);
  }
}
