import { z } from 'zod';
import type { ToolDef } from '../../interfaces';

/**
 * 3.2.0 card blocker tools - appended at the end of the registry in
 * tools/index.ts.
 */
export const blockerTools: ToolDef[] = [
  {
    name: 'kaiten_get_blockers',
    description: 'Get blockers on a card',
    annotations: { readOnlyHint: true },
    inputSchema: {
      cardId: z.number().describe('Card ID'),
    },
    handler: async (sdk, args) => sdk.getBlockers(args.cardId),
  },
  {
    name: 'kaiten_block_card',
    description: 'Block a card, optionally with a reason and/or a blocking card',
    inputSchema: {
      cardId: z.number().describe('Card ID to block'),
      reason: z.string().optional().describe('Reason for the block (optional)'),
      blockerCardId: z.number().optional().describe('ID of the card causing the block (optional)'),
    },
    handler: async (sdk, args) => sdk.blockCard(args.cardId, args.reason, args.blockerCardId),
  },
  {
    name: 'kaiten_unblock_card',
    description: 'Remove a blocker from a card. Requires KAITEN_API_DELETE_ALLOW=true.',
    annotations: { destructiveHint: true },
    inputSchema: {
      cardId: z.number().describe('Card ID'),
      blockerId: z.number().describe('Blocker ID to remove'),
    },
    handler: async (sdk, args) => sdk.unblockCard(args.cardId, args.blockerId),
  },
];
