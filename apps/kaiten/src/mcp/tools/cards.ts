import { z } from 'zod';
import type { Card } from '../../kaiten';
import type { ToolDef } from '../../interfaces';
import { applyCardsLimit } from './limit';

export const cardTools: ToolDef[] = [
  {
    name: 'kaiten_cards',
    description:
      'Get list of cards, newest-updated first, active (on-board) cards only by default — ' +
      'pass condition: 2 for archived or "all" for both. May return a truncated-list wrapper ' +
      '({ truncated, total, returned, note, cards }) instead of a plain array when KAITEN_CARDS_LIMIT is set and exceeded.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      spaceId: z.number().optional().describe('Space ID (optional, uses default if not specified)'),
      boardId: z.number().optional().describe('Board ID (optional)'),
      minimal: z
        .boolean()
        .optional()
        .describe('Return minimal JSON format (token optimized). Default false (full payload), or KAITEN_MINIMAL_DEFAULT.'),
      condition: z
        .union([z.literal(1), z.literal(2), z.literal('all')])
        .optional()
        .describe('1 = active cards on the board (default), 2 = archived, "all" = both.'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe('Max cards to return (default 100). Values above 100 are fetched in pages of 100 automatically.'),
      offset: z.number().int().min(0).optional().describe('Number of cards to skip (pagination).'),
      orderBy: z.string().optional().describe("Sort field (default 'updated')."),
      orderDirection: z.enum(['asc', 'desc']).optional().describe("Sort direction (default 'desc' — newest first)."),
    },
    handler: async (sdk, args) => {
      const explicitMinimal = args.minimal === true ? true : args.minimal === false ? false : undefined;
      const minimal = explicitMinimal ?? sdk.config?.minimalDefault ?? false;
      const result = await sdk.getCards(args.spaceId ?? null, args.boardId ?? null, minimal, {
        condition: args.condition,
        limit: args.limit,
        offset: args.offset,
        orderBy: args.orderBy,
        orderDirection: args.orderDirection,
      });
      return applyCardsLimit(result, sdk.config?.cardsLimit ?? null);
    },
  },
  {
    name: 'kaiten_card',
    description: 'Get card details',
    annotations: { readOnlyHint: true },
    inputSchema: {
      cardId: z.number().describe('Card ID'),
      simple: z
        .boolean()
        .optional()
        .describe('Return minimal JSON format (token optimized). Default true. Pass false to get the full card payload.'),
    },
    handler: async (sdk, args) => sdk.getCard(args.cardId, args.simple !== false),
  },
  {
    name: 'kaiten_create_card',
    description:
      'Create a new independent card on a board. Use this for creating separate tasks, not child cards/subtasks. Если известен laneId — указывайте, иначе карточка попадёт на дефолтную lane доски, что для многих досок неверно.',
    inputSchema: {
      title: z.string().describe('Card title - for an independent task on a board'),
      boardId: z.number().describe('Board ID where to create the independent card'),
      columnId: z
        .number()
        .optional()
        .describe(
          'Column ID where to place the independent card. Optional if KAITEN_DEFAULT_COLUMN_ID is configured server-side; otherwise required.'
        ),
      description: z.string().optional().describe('Card description (optional)'),
      laneId: z
        .number()
        .optional()
        .describe(
          'Lane ID внутри доски. Опционально, но рекомендуется указывать: иначе карточка попадёт на дефолтную lane доски (или на KAITEN_DEFAULT_LANE_ID, если он настроен). Список lanes доски — kaiten_lanes.'
        ),
      tags: z.array(z.string()).optional().describe('Tag names to attach to the new card (optional)'),
      size: z.number().optional().describe('Card size/estimate (optional)'),
      plannedStart: z.string().optional().describe('Planned start date, YYYY-MM-DD (optional)'),
      plannedEnd: z.string().optional().describe('Planned end date, YYYY-MM-DD (optional)'),
      typeId: z.number().optional().describe('Card type ID (optional). Discover available types via kaiten_card_types.'),
    },
    handler: async (sdk, args) =>
      sdk.createCard({
        title: args.title,
        boardId: args.boardId,
        columnId: args.columnId,
        description: args.description,
        laneId: args.laneId,
        tags: args.tags,
        size: args.size,
        plannedStart: args.plannedStart,
        plannedEnd: args.plannedEnd,
        typeId: args.typeId,
      }),
  },
  {
    name: 'kaiten_update_card',
    description:
      'Update a card. Prefer the structured fields (title, description, columnId, laneId, boardId, size, ' +
      'plannedStart, plannedEnd, dueDate, asap, condition) - they are self-documenting and validated. The legacy ' +
      '`data` JSON string is DEPRECATED (kept only for backward compatibility with raw Kaiten fields not yet ' +
      'modeled above); when both are given, explicit structured fields win over the same key inside `data`. At ' +
      'least one field must be provided.',
    inputSchema: {
      cardId: z.number().describe('Card ID'),
      title: z.string().optional().describe('New card title (optional)'),
      description: z.string().optional().describe('New card description (optional)'),
      columnId: z.number().optional().describe('Move to this column ID (optional)'),
      laneId: z.number().optional().describe('Move to this lane ID (optional). List lanes via kaiten_lanes.'),
      boardId: z.number().optional().describe('Move to this board ID (optional)'),
      size: z.number().optional().describe('Card size/estimate (optional)'),
      plannedStart: z.string().optional().describe('Planned start date, YYYY-MM-DD (optional)'),
      plannedEnd: z.string().optional().describe('Planned end date, YYYY-MM-DD (optional)'),
      dueDate: z.string().optional().describe('Due date, YYYY-MM-DD (optional)'),
      asap: z.boolean().optional().describe('Mark card as ASAP/urgent (optional)'),
      condition: z.number().optional().describe('Card condition: 1 = active, 2 = archived (optional)'),
      data: z
        .string()
        .optional()
        .describe('DEPRECATED: JSON string of extra raw Kaiten fields to patch. Prefer the structured fields above.'),
    },
    handler: async (sdk, args) => {
      const base: Record<string, unknown> = args.data ? JSON.parse(args.data) : {};
      const overlay: Record<string, unknown> = {};
      if (args.title !== undefined) overlay.title = args.title;
      if (args.description !== undefined) overlay.description = args.description;
      if (args.columnId !== undefined) overlay.column_id = args.columnId;
      if (args.laneId !== undefined) overlay.lane_id = args.laneId;
      if (args.boardId !== undefined) overlay.board_id = args.boardId;
      if (args.size !== undefined) overlay.size = args.size;
      if (args.plannedStart !== undefined) overlay.planned_start = args.plannedStart;
      if (args.plannedEnd !== undefined) overlay.planned_end = args.plannedEnd;
      if (args.dueDate !== undefined) overlay.due_date = args.dueDate;
      if (args.asap !== undefined) overlay.asap = args.asap;
      if (args.condition !== undefined) overlay.condition = args.condition;

      const patch = { ...base, ...overlay };
      if (Object.keys(patch).length === 0) {
        throw new Error('No fields to update - pass at least one field');
      }
      return sdk.updateCard(args.cardId, patch);
    },
  },
  {
    name: 'kaiten_delete_card',
    description: 'Delete a card. Requires KAITEN_API_DELETE_ALLOW=true.',
    annotations: { destructiveHint: true },
    inputSchema: {
      cardId: z.number().describe('Card ID'),
    },
    handler: async (sdk, args) => sdk.deleteCard(args.cardId),
  },
  {
    name: 'kaiten_move_card',
    description:
      'Move a card to different column. Если laneId не указан, карточка останется на текущей lane (или дефолтной для новой колонки).',
    inputSchema: {
      cardId: z.number().describe('Card ID'),
      columnId: z.number().describe('Target column ID'),
      laneId: z.number().optional().describe('Lane ID внутри колонки. Опционально. Список lanes — kaiten_lanes.'),
    },
    handler: async (sdk, args) => sdk.moveToColumn(args.cardId, args.columnId, args.laneId ?? null),
  },
  {
    name: 'kaiten_assign_card',
    description: 'Assign user to card',
    inputSchema: {
      cardId: z.number().describe('Card ID'),
      userId: z.number().describe('User ID to assign'),
    },
    handler: async (sdk, args) => sdk.assignTo(args.cardId, args.userId),
  },
  {
    name: 'kaiten_find_cards',
    description:
      'Find cards by tag (token optimized - returns only id, title, board_id, column_id, tags). May return a ' +
      'truncated-list wrapper ({ truncated, total, returned, note, cards }) instead of a plain array when ' +
      'KAITEN_CARDS_LIMIT is set and exceeded.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      tagName: z.string().describe('Tag name to filter by'),
      boardId: z.number().optional().describe('Board ID (optional)'),
    },
    handler: async (sdk, args) => {
      const findCards = (await sdk.getCards(null, args.boardId ?? null)) as Card[];
      const findFiltered = findCards.filter((c) => c.tags?.some((t) => t.name === args.tagName));
      const projected = findFiltered.map((c) => ({
        id: c.id,
        title: c.title,
        board_id: c.board_id,
        column_id: c.column_id,
        tags: c.tags,
      }));
      return applyCardsLimit(projected, sdk.config?.cardsLimit ?? null);
    },
  },
];

/** Additive, accurately named alias. `kaiten_find_cards` remains frozen for compatibility. */
export const findCardsByTagTool: ToolDef = {
  ...cardTools[cardTools.length - 1],
  name: 'kaiten_find_cards_by_tag',
  description: 'Find cards by exact tag name. Alias of kaiten_find_cards; this name makes its tag-only semantics explicit.',
};

// `newCardTools` (3.1.0 additive tools) moved to ./cards-additive.ts to keep
// this file under the 200-line limit; re-exported unchanged via tools/index.ts.
export { newCardTools } from './cards-additive';
