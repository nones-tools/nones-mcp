import { z } from 'zod';
import type { ToolDef } from '../../interfaces';

export const commentTools: ToolDef[] = [
  {
    name: 'kaiten_add_comment',
    description: 'Add comment to card',
    inputSchema: {
      cardId: z.number().describe('Card ID'),
      text: z.string().describe('Comment text'),
    },
    handler: async (sdk, args) => sdk.addComment(args.cardId, args.text),
  },
  {
    name: 'kaiten_get_comments',
    description: 'Get comments for card',
    annotations: { readOnlyHint: true },
    inputSchema: {
      cardId: z.number().describe('Card ID'),
    },
    handler: async (sdk, args) => sdk.getComments(args.cardId),
  },
];

export const tagTools: ToolDef[] = [
  {
    name: 'kaiten_add_tag',
    description: 'Add tag to card',
    inputSchema: {
      cardId: z.number().describe('Card ID'),
      tagName: z.string().describe('Tag name'),
    },
    handler: async (sdk, args) => sdk.addTag(args.cardId, args.tagName),
  },
  {
    name: 'kaiten_remove_tag',
    description: 'Remove tag from card. Requires KAITEN_API_DELETE_ALLOW=true.',
    annotations: { destructiveHint: true },
    inputSchema: {
      cardId: z.number().describe('Card ID'),
      tagName: z.string().describe('Tag name'),
    },
    handler: async (sdk, args) => sdk.removeTag(args.cardId, args.tagName),
  },
];

/**
 * 3.1.0 additive comment tools - appended after the legacy `commentTools` /
 * `tagTools` sequences in tools/index.ts.
 */
export const newCommentTools: ToolDef[] = [
  {
    name: 'kaiten_update_comment',
    description: 'Update the text of an existing comment',
    inputSchema: {
      commentId: z.number().describe('Comment ID'),
      text: z.string().describe('New comment text'),
    },
    handler: async (sdk, args) => sdk.updateComment(args.commentId, args.text),
  },
  {
    name: 'kaiten_delete_comment',
    description: 'Delete a comment. Requires KAITEN_API_DELETE_ALLOW=true.',
    annotations: { destructiveHint: true },
    inputSchema: {
      commentId: z.number().describe('Comment ID'),
    },
    handler: async (sdk, args) => sdk.deleteComment(args.commentId),
  },
];
