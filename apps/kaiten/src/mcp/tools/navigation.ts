import { z } from 'zod';
import type { ToolDef } from '../../interfaces';

export const navigationTools: ToolDef[] = [
  {
    name: 'kaiten_spaces',
    description: 'Get list of available Kaiten spaces',
    annotations: { readOnlyHint: true },
    inputSchema: {},
    handler: async (sdk) => sdk.getSpaces(),
  },
  {
    name: 'kaiten_boards',
    description: 'Get list of boards in a space',
    annotations: { readOnlyHint: true },
    inputSchema: {
      spaceId: z.number().optional().describe('Space ID (optional, uses default if not specified)'),
    },
    handler: async (sdk, args) => sdk.getBoards(args.spaceId),
  },
  {
    name: 'kaiten_columns',
    description: 'Get list of columns in a board',
    annotations: { readOnlyHint: true },
    inputSchema: {
      boardId: z.number().describe('Board ID'),
    },
    handler: async (sdk, args) => sdk.getColumns(args.boardId),
  },
];

/**
 * 3.1.0 additive navigation tool - appended after the legacy `navigationTools`
 * sequence in tools/index.ts (never interleaved with it, so tool order for
 * the original 39 tools is unchanged).
 */
export const newNavigationTools: ToolDef[] = [
  {
    name: 'kaiten_lanes',
    description: 'Get list of lanes on a board. Use this to discover laneId values for kaiten_create_card / kaiten_move_card.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      boardId: z.number().describe('Board ID'),
    },
    handler: async (sdk, args) => sdk.getLanes(args.boardId),
  },
];
