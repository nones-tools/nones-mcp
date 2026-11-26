import { z } from 'zod';
import type { ToolDef } from '../../interfaces';

export const checklistTools: ToolDef[] = [
  {
    name: 'kaiten_get_checklists',
    description: 'Get checklists from a card',
    annotations: { readOnlyHint: true },
    inputSchema: {
      cardId: z.number().describe('Card ID'),
    },
    handler: async (sdk, args) => sdk.getChecklists(args.cardId),
  },
  {
    name: 'kaiten_create_checklist',
    description: 'Create a checklist on a card',
    inputSchema: {
      cardId: z.number().describe('Card ID'),
      name: z.string().describe('Checklist name'),
    },
    handler: async (sdk, args) => sdk.createChecklist(args.cardId, args.name),
  },
  {
    name: 'kaiten_delete_checklist',
    description: 'Delete a checklist from a card. Requires KAITEN_API_DELETE_ALLOW=true.',
    annotations: { destructiveHint: true },
    inputSchema: {
      cardId: z.number().describe('Card ID'),
      checklistId: z.number().describe('Checklist ID to delete'),
    },
    handler: async (sdk, args) => sdk.deleteChecklist(args.cardId, args.checklistId),
  },
  {
    name: 'kaiten_update_checklist',
    description: 'Update a checklist name',
    inputSchema: {
      cardId: z.number().describe('Card ID'),
      checklistId: z.number().describe('Checklist ID'),
      name: z.string().describe('New checklist name'),
    },
    handler: async (sdk, args) => sdk.updateChecklist(args.cardId, args.checklistId, { name: args.name }),
  },
  {
    name: 'kaiten_toggle_checklist_item',
    description: 'Check or uncheck a checklist item',
    inputSchema: {
      cardId: z.number().describe('Card ID'),
      checklistId: z.number().describe('Checklist ID'),
      itemId: z.number().describe('Checklist item ID'),
      checked: z.boolean().describe('Set to true to check, false to uncheck'),
    },
    handler: async (sdk, args) => sdk.toggleChecklistItem(args.cardId, args.checklistId, args.itemId, args.checked),
  },
  {
    name: 'kaiten_add_checklist_item',
    description: 'Add an item to a checklist',
    inputSchema: {
      cardId: z.number().describe('Card ID'),
      checklistId: z.number().describe('Checklist ID'),
      text: z.string().describe('Item text'),
    },
    handler: async (sdk, args) => sdk.addChecklistItem(args.cardId, args.checklistId, args.text),
  },
  {
    name: 'kaiten_delete_checklist_item',
    description: 'Delete an item from a checklist. Requires KAITEN_API_DELETE_ALLOW=true.',
    annotations: { destructiveHint: true },
    inputSchema: {
      cardId: z.number().describe('Card ID'),
      checklistId: z.number().describe('Checklist ID'),
      itemId: z.number().describe('Item ID to delete'),
    },
    handler: async (sdk, args) => sdk.deleteChecklistItem(args.cardId, args.checklistId, args.itemId),
  },
];
