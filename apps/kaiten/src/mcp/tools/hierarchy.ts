import { z } from 'zod';
import type { ToolDef } from '../../interfaces';

export const hierarchyTools: ToolDef[] = [
  {
    name: 'kaiten_create_child_card',
    description: 'Create a child card under a parent card. Use this when you need to create a nested task, subtask, or child card.',
    inputSchema: {
      parentId: z.number().describe('Parent card ID - the card under which to create the child card'),
      title: z.string().describe('Child card title'),
    },
    handler: async (sdk, args) => sdk.createSubtask(args.parentId, args.title),
  },
  {
    name: 'kaiten_get_child_cards',
    description: 'Get immediate child cards of a parent card (one level only)',
    annotations: { readOnlyHint: true },
    inputSchema: {
      cardId: z.number().describe('Parent card ID'),
    },
    handler: async (sdk, args) => sdk.getSubtasks(args.cardId, true),
  },
  {
    name: 'kaiten_get_all_child_cards',
    description: 'Get all child cards of a parent card recursively (includes nested child cards at all levels)',
    annotations: { readOnlyHint: true },
    inputSchema: {
      cardId: z.number().describe('Parent card ID'),
    },
    handler: async (sdk, args) => sdk.getAllSubtasks(args.cardId, true),
  },
  {
    name: 'kaiten_get_parent',
    description: 'Get the parent card of a child card/subtask',
    annotations: { readOnlyHint: true },
    inputSchema: {
      cardId: z.number().describe('Card ID'),
    },
    handler: async (sdk, args) => sdk.getParent(args.cardId, true),
  },
  {
    name: 'kaiten_attach_to_parent',
    description:
      'Link an existing card as a child/subtask under a parent card. Use this when you already have a card that needs to become a subtask of another card.',
    inputSchema: {
      cardId: z.number().describe('Child card ID to attach'),
      parentId: z.number().describe('Parent card ID'),
      position: z.number().optional().describe('Position in parent children list (optional, default 0)'),
    },
    handler: async (sdk, args) => sdk.attachToParent(args.cardId, args.parentId, args.position),
  },
  {
    name: 'kaiten_detach_from_parent',
    description:
      'Remove parent-child relationship - makes a subtask/child card into an independent card. Requires KAITEN_API_DELETE_ALLOW=true.',
    annotations: { destructiveHint: true },
    inputSchema: {
      cardId: z.number().describe('Card ID'),
    },
    handler: async (sdk, args) => sdk.detachFromParent(args.cardId),
  },
];
