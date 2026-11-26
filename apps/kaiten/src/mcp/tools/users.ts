import { z } from 'zod';
import type { ToolDef } from '../../interfaces';

export const userTools: ToolDef[] = [
  {
    name: 'kaiten_users',
    description: 'Get list of users',
    annotations: { readOnlyHint: true },
    inputSchema: {},
    handler: async (sdk) => sdk.getUsers(),
  },
  {
    name: 'kaiten_search_users',
    description: 'Search users by query',
    annotations: { readOnlyHint: true },
    inputSchema: {
      query: z.string().describe('Search query'),
    },
    handler: async (sdk, args) => sdk.findUser(args.query),
  },
];

/**
 * 3.2.0 additive user tool - appended at the end of the registry in
 * tools/index.ts, never interleaved with `userTools`.
 */
export const newUserTools: ToolDef[] = [
  {
    name: 'kaiten_current_user',
    description: 'Get the current authenticated user (the owner of the configured API token)',
    annotations: { readOnlyHint: true },
    inputSchema: {},
    handler: async (sdk) => sdk.getCurrentUser(),
  },
];
