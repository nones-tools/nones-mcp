import { z } from 'zod';
import type { ToolDef } from '../../interfaces';

/**
 * 3.2.0 card external-link tools - appended at the end of the registry in
 * tools/index.ts.
 */
export const linkTools: ToolDef[] = [
  {
    name: 'kaiten_get_external_links',
    description: 'Get external links attached to a card',
    annotations: { readOnlyHint: true },
    inputSchema: {
      cardId: z.number().describe('Card ID'),
    },
    handler: async (sdk, args) => sdk.getExternalLinks(args.cardId),
  },
  {
    name: 'kaiten_add_external_link',
    description: 'Attach an external link (e.g. a PR or issue URL) to a card',
    inputSchema: {
      cardId: z.number().describe('Card ID'),
      url: z.string().describe('Link URL'),
      description: z.string().optional().describe('Link description (optional)'),
    },
    handler: async (sdk, args) => sdk.addExternalLink(args.cardId, args.url, args.description),
  },
  {
    name: 'kaiten_remove_external_link',
    description: 'Remove an external link from a card. Requires KAITEN_API_DELETE_ALLOW=true.',
    annotations: { destructiveHint: true },
    inputSchema: {
      cardId: z.number().describe('Card ID'),
      linkId: z.number().describe('External link ID to remove'),
    },
    handler: async (sdk, args) => sdk.removeExternalLink(args.cardId, args.linkId),
  },
];
