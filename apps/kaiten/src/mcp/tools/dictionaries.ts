import { z } from 'zod';
import type { ToolDef } from '../../interfaces';

/**
 * 3.2.0 company-wide read-only dictionaries - appended at the end of the
 * registry in tools/index.ts.
 */
export const dictionaryTools: ToolDef[] = [
  {
    name: 'kaiten_tags',
    description: 'List company tags. Optionally filter by search query and/or space.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      query: z.string().optional().describe('Search query to filter tags by name (optional)'),
      spaceId: z.number().optional().describe('Space ID to filter tags by (optional)'),
    },
    handler: async (sdk, args) => sdk.listTags(args.query, args.spaceId),
  },
  {
    name: 'kaiten_card_types',
    description: 'List company card types. Use the returned id as typeId for kaiten_create_card.',
    annotations: { readOnlyHint: true },
    inputSchema: {},
    handler: async (sdk) => sdk.getCardTypes(),
  },
  {
    name: 'kaiten_custom_properties',
    description:
      'List company custom field definitions. Values are set on cards via kaiten_update_card legacy `data` with {"properties": {"id_<propertyId>": value}}.',
    annotations: { readOnlyHint: true },
    inputSchema: {},
    handler: async (sdk) => sdk.getCustomProperties(),
  },
];
