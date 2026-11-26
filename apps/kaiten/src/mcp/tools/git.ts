import { z } from 'zod';
import type { ToolDef } from '../../interfaces';

export const gitTools: ToolDef[] = [
  {
    name: 'kaiten_git_branch',
    description: 'Create git branch for card',
    inputSchema: {
      cardId: z.number().describe('Card ID'),
    },
    handler: async (sdk, args) => sdk.createGitBranch(args.cardId),
  },
  {
    name: 'kaiten_git_checkout',
    description: 'Checkout git branch for card',
    inputSchema: {
      cardId: z.number().describe('Card ID'),
    },
    handler: async (sdk, args) => sdk.checkoutGitBranch(args.cardId),
  },
  {
    name: 'kaiten_git_commit',
    description: 'Commit changes with card reference',
    inputSchema: {
      cardId: z.number().describe('Card ID'),
      message: z.string().optional().describe('Commit message (optional)'),
    },
    handler: async (sdk, args) => sdk.commitGit(args.cardId, args.message),
  },
  {
    name: 'kaiten_git_status',
    description: 'Get git status',
    annotations: { readOnlyHint: true },
    inputSchema: {},
    handler: async (sdk) => sdk.getGitStatus(),
  },
  {
    name: 'kaiten_git_push',
    description: 'Push git branch for card',
    inputSchema: {
      cardId: z.number().describe('Card ID'),
    },
    handler: async (sdk, args) => sdk.gitPush(args.cardId),
  },
];
