import { z } from 'zod';
import type { ToolDef } from '../../interfaces';

export const fileTools: ToolDef[] = [
  {
    name: 'kaiten_get_files',
    description: 'Get list of files attached to a card',
    annotations: { readOnlyHint: true },
    inputSchema: {
      cardId: z.number().describe('Card ID'),
    },
    handler: async (sdk, args) => sdk.getCardFiles(args.cardId),
  },
  {
    name: 'kaiten_download_file',
    description: 'Download a single file from a card to temp directory',
    inputSchema: {
      cardId: z.number().describe('Card ID'),
      fileId: z.number().describe('File ID to download'),
      outputDir: z.string().optional().describe('Output directory (optional, defaults to /tmp/kaiten/{cardId}/)'),
    },
    handler: async (sdk, args) => sdk.downloadFileToDisk(args.cardId, args.fileId, args.outputDir ?? null),
  },
  {
    name: 'kaiten_download_all_files',
    description: 'Download all files from a card to temp directory',
    inputSchema: {
      cardId: z.number().describe('Card ID'),
      outputDir: z.string().optional().describe('Output directory (optional, defaults to /tmp/kaiten/{cardId}/)'),
    },
    handler: async (sdk, args) => sdk.downloadAllCardFiles(args.cardId, args.outputDir ?? null),
  },
  {
    name: 'kaiten_clean_temp',
    description: 'Clean temporary directory for Kaiten files',
    annotations: { destructiveHint: true },
    inputSchema: {
      dir: z
        .string()
        .optional()
        .describe('Directory to clean (optional, /tmp/kaiten/{cardId}/ if cardId in dir path, otherwise /tmp/kaiten/)'),
    },
    handler: async (sdk, args) => {
      let cardId: number | null = null;
      const match = args.dir && typeof args.dir === 'string' ? args.dir.match(/\/kaiten\/(\d+)/) : null;
      if (match) {
        cardId = parseInt(match[1], 10);
      }
      return { deleted: await sdk.cleanTempDir(cardId) };
    },
  },
];

/**
 * 3.2.0 additive file tool - appended at the end of the registry in
 * tools/index.ts, never interleaved with `fileTools`.
 */
export const newFileTools: ToolDef[] = [
  {
    name: 'kaiten_attach_file',
    description: 'Upload a local file and attach it to a card',
    inputSchema: {
      cardId: z.number().describe('Card ID'),
      filePath: z.string().describe('Path to the local file to upload'),
      fileName: z.string().optional().describe('File name to use on Kaiten (optional, defaults to the basename of filePath)'),
    },
    handler: async (sdk, args) => sdk.attachFile(args.cardId, args.filePath, args.fileName),
  },
];
