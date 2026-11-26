import { z } from 'zod';
import type { ToolDef } from '../../interfaces';

/**
 * 3.1.0 additive card tools - closing gaps against SDK methods that already
 * existed but had no MCP tool wrapper. Appended after the legacy `cardTools`
 * sequence in tools/index.ts; never interleaved with it. Split out of
 * `cards.ts` in 3.4.0 (specs/001-agent-guardrails) to keep that file under
 * the 200-line limit once the cards-limit wiring landed there.
 */
export const newCardTools: ToolDef[] = [
  {
    name: 'kaiten_archive_card',
    description: 'Archive a card (sets condition to archived)',
    inputSchema: {
      cardId: z.number().describe('Card ID'),
    },
    handler: async (sdk, args) => sdk.archive(args.cardId),
  },
  {
    name: 'kaiten_unarchive_card',
    description: 'Unarchive a card (sets condition back to active)',
    inputSchema: {
      cardId: z.number().describe('Card ID'),
    },
    handler: async (sdk, args) => sdk.unarchive(args.cardId),
  },
  {
    name: 'kaiten_unassign_card',
    description: 'Remove a user assignment from a card',
    inputSchema: {
      cardId: z.number().describe('Card ID'),
      userId: z.number().describe('User ID to unassign'),
    },
    handler: async (sdk, args) => sdk.unassignFrom(args.cardId, args.userId),
  },
];
