import { z } from 'zod';
import type { ToolDef } from '../../interfaces';

/**
 * 3.2.0 card time-log tools - appended at the end of the registry in
 * tools/index.ts.
 */
export const timeLogTools: ToolDef[] = [
  {
    name: 'kaiten_get_time_logs',
    description: 'Get time logs recorded on a card',
    annotations: { readOnlyHint: true },
    inputSchema: {
      cardId: z.number().describe('Card ID'),
    },
    handler: async (sdk, args) => sdk.getTimeLogs(args.cardId),
  },
  {
    name: 'kaiten_add_time_log',
    description: 'Log time spent on a card',
    inputSchema: {
      cardId: z.number().describe('Card ID'),
      timeSpent: z.number().describe('Time spent, in minutes'),
      forDate: z.string().describe('Date the time was spent, YYYY-MM-DD'),
      roleId: z.number().describe('Role ID the time is logged under'),
      comment: z.string().optional().describe('Comment (optional)'),
    },
    handler: async (sdk, args) => sdk.addTimeLog(args.cardId, args.timeSpent, args.forDate, args.roleId, args.comment),
  },
];
