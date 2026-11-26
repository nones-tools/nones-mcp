import { describe, expect, mock, test } from 'bun:test';
import type { KaitenSDK } from '@/sdk';
import { tools } from '@/mcp/tools';

/** What the kaiten_cards handler forwards when no list option is given (all keys present, undefined). */
const NO_LIST_OPTIONS = { condition: undefined, limit: undefined, offset: undefined, orderBy: undefined, orderDirection: undefined };

/**
 * Expected tool list + required-param sets, transcribed directly from the
 * old hand-rolled server's `registerTools()` in mcp-server.js (root of the
 * repo). The old server actually registers 39 tools (not 38 as the rewrite
 * spec assumed) - this list matches that file exactly, which is the
 * authoritative behavioral reference per the spec ("must match the old
 * mcp-server.js exactly").
 *
 * 3.1.0 note: this is an INTENTIONAL contract extension, not a drift. The
 * first 39 entries (order + required params) are exactly the frozen legacy
 * contract and must never change without a major version bump. The 6 tools
 * appended below are purely additive (new tools, closing pre-existing SDK
 * gaps + a new `kaiten_lanes` lookup) - additive changes are allowed in a
 * minor version per constitution Principle IV (amended 1.1.0). Also,
 * `kaiten_update_card` gained optional structured fields alongside the
 * legacy `data` string, which is why `data` (and `cardId` alone) is now
 * sufficient - see the "required params match" test below.
 *
 * 3.2.0 note: 13 more additive tools are appended after the 3.1.0 six -
 * time logs, card blockers, external links, company dictionaries, the
 * current user, and a file-upload tool. Same additive-contract rule applies.
 */
const OLD_TOOLS: { name: string; required: string[] }[] = [
  { name: 'kaiten_spaces', required: [] },
  { name: 'kaiten_boards', required: [] },
  { name: 'kaiten_columns', required: ['boardId'] },
  { name: 'kaiten_cards', required: [] },
  { name: 'kaiten_card', required: ['cardId'] },
  // 3.4.0: `columnId` required -> optional (specs/001-agent-guardrails US7,
  // KAITEN_DEFAULT_COLUMN_ID). Intentional relaxation, not a drift - every
  // previously valid call (always passing columnId) behaves identically;
  // constitution 1.3.0 amendment clarifies the required-ness freeze forbids
  // tightening only, not required->optional relaxations like this one.
  { name: 'kaiten_create_card', required: ['title', 'boardId'] },
  { name: 'kaiten_update_card', required: ['cardId'] },
  { name: 'kaiten_delete_card', required: ['cardId'] },
  { name: 'kaiten_move_card', required: ['cardId', 'columnId'] },
  { name: 'kaiten_assign_card', required: ['cardId', 'userId'] },
  { name: 'kaiten_find_cards', required: ['tagName'] },
  { name: 'kaiten_add_comment', required: ['cardId', 'text'] },
  { name: 'kaiten_get_comments', required: ['cardId'] },
  { name: 'kaiten_create_child_card', required: ['parentId', 'title'] },
  { name: 'kaiten_get_child_cards', required: ['cardId'] },
  { name: 'kaiten_get_all_child_cards', required: ['cardId'] },
  { name: 'kaiten_get_parent', required: ['cardId'] },
  { name: 'kaiten_attach_to_parent', required: ['cardId', 'parentId'] },
  { name: 'kaiten_detach_from_parent', required: ['cardId'] },
  { name: 'kaiten_add_tag', required: ['cardId', 'tagName'] },
  { name: 'kaiten_remove_tag', required: ['cardId', 'tagName'] },
  { name: 'kaiten_git_branch', required: ['cardId'] },
  { name: 'kaiten_git_checkout', required: ['cardId'] },
  { name: 'kaiten_git_commit', required: ['cardId'] },
  { name: 'kaiten_git_status', required: [] },
  { name: 'kaiten_git_push', required: ['cardId'] },
  { name: 'kaiten_users', required: [] },
  { name: 'kaiten_search_users', required: ['query'] },
  { name: 'kaiten_get_checklists', required: ['cardId'] },
  { name: 'kaiten_create_checklist', required: ['cardId', 'name'] },
  { name: 'kaiten_delete_checklist', required: ['cardId', 'checklistId'] },
  { name: 'kaiten_update_checklist', required: ['cardId', 'checklistId', 'name'] },
  { name: 'kaiten_toggle_checklist_item', required: ['cardId', 'checklistId', 'itemId', 'checked'] },
  { name: 'kaiten_add_checklist_item', required: ['cardId', 'checklistId', 'text'] },
  { name: 'kaiten_delete_checklist_item', required: ['cardId', 'checklistId', 'itemId'] },
  { name: 'kaiten_get_files', required: ['cardId'] },
  { name: 'kaiten_download_file', required: ['cardId', 'fileId'] },
  { name: 'kaiten_download_all_files', required: ['cardId'] },
  { name: 'kaiten_clean_temp', required: [] },
  // --- 3.1.0 additive tools, appended after the frozen 39 above ---
  { name: 'kaiten_lanes', required: ['boardId'] },
  { name: 'kaiten_update_comment', required: ['commentId', 'text'] },
  { name: 'kaiten_delete_comment', required: ['commentId'] },
  { name: 'kaiten_archive_card', required: ['cardId'] },
  { name: 'kaiten_unarchive_card', required: ['cardId'] },
  { name: 'kaiten_unassign_card', required: ['cardId', 'userId'] },
  // --- 3.2.0 additive tools, appended after the 45 above ---
  { name: 'kaiten_current_user', required: [] },
  { name: 'kaiten_tags', required: [] },
  { name: 'kaiten_card_types', required: [] },
  { name: 'kaiten_custom_properties', required: [] },
  { name: 'kaiten_get_time_logs', required: ['cardId'] },
  { name: 'kaiten_add_time_log', required: ['cardId', 'timeSpent', 'forDate', 'roleId'] },
  { name: 'kaiten_get_blockers', required: ['cardId'] },
  { name: 'kaiten_block_card', required: ['cardId'] },
  { name: 'kaiten_unblock_card', required: ['cardId', 'blockerId'] },
  { name: 'kaiten_get_external_links', required: ['cardId'] },
  { name: 'kaiten_add_external_link', required: ['cardId', 'url'] },
  { name: 'kaiten_remove_external_link', required: ['cardId', 'linkId'] },
  { name: 'kaiten_attach_file', required: ['cardId', 'filePath'] },
];

function toolByName(name: string) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool ${name} not found in registry`);
  return tool;
}

/** A required zod field is anything that isn't `.optional()` (i.e. not undefined-accepting). */
function requiredParams(inputSchema: Record<string, { isOptional?: () => boolean }>): string[] {
  return Object.entries(inputSchema)
    .filter(([, schema]) => !schema.isOptional?.())
    .map(([key]) => key);
}

function makeStubSdk(overrides: Record<string, (...args: any[]) => any> = {}): KaitenSDK {
  const base: Record<string, (...args: any[]) => any> = {
    getSpaces: mock(async () => ['space']),
    getBoards: mock(async () => ['board']),
    getColumns: mock(async () => ['column']),
    getCards: mock(async () => []),
    getCard: mock(async () => ({ id: 1, title: 'card' })),
    createCard: mock(async () => ({ id: 1 })),
    updateCard: mock(async () => ({ id: 1 })),
    deleteCard: mock(async () => ({ ok: true })),
    moveToColumn: mock(async () => ({ success: true })),
    assignTo: mock(async () => ({ success: true })),
    addComment: mock(async () => ({ id: 1 })),
    getComments: mock(async () => []),
    createSubtask: mock(async () => ({ id: 2 })),
    getSubtasks: mock(async () => []),
    getAllSubtasks: mock(async () => []),
    getParent: mock(async () => null),
    attachToParent: mock(async () => ({ ok: true })),
    detachFromParent: mock(async () => ({ ok: true })),
    addTag: mock(async () => ({ id: 1 })),
    removeTag: mock(async () => ({ id: 1 })),
    createGitBranch: mock(async () => 'feature/1-branch'),
    checkoutGitBranch: mock(async () => 'feature/1-branch'),
    commitGit: mock(async () => undefined),
    getGitStatus: mock(async () => 'clean'),
    gitPush: mock(async () => undefined),
    getUsers: mock(async () => []),
    findUser: mock(async () => ({ id: 1 })),
    getChecklists: mock(async () => []),
    createChecklist: mock(async () => ({ id: 1 })),
    deleteChecklist: mock(async () => ({ ok: true })),
    updateChecklist: mock(async () => ({ id: 1 })),
    toggleChecklistItem: mock(async () => ({ id: 1 })),
    addChecklistItem: mock(async () => ({ id: 1 })),
    deleteChecklistItem: mock(async () => ({ ok: true })),
    getCardFiles: mock(async () => []),
    downloadFileToDisk: mock(async () => ({ path: '/tmp/x' })),
    downloadAllCardFiles: mock(async () => []),
    cleanTempDir: mock(async () => 0),
    getLanes: mock(async () => []),
    updateComment: mock(async () => ({ id: 1 })),
    deleteComment: mock(async () => undefined),
    archive: mock(async () => ({ id: 1 })),
    unarchive: mock(async () => ({ id: 1 })),
    unassignFrom: mock(async () => ({ id: 1 })),
    getCurrentUser: mock(async () => ({ id: 1, full_name: 'Me' })),
    listTags: mock(async () => []),
    getCardTypes: mock(async () => []),
    getCustomProperties: mock(async () => []),
    getTimeLogs: mock(async () => []),
    addTimeLog: mock(async () => ({ id: 1 })),
    getBlockers: mock(async () => []),
    blockCard: mock(async () => ({ id: 1 })),
    unblockCard: mock(async () => ({ ok: true })),
    getExternalLinks: mock(async () => []),
    addExternalLink: mock(async () => ({ id: 1 })),
    removeExternalLink: mock(async () => ({ ok: true })),
    attachFile: mock(async () => ({ id: 1 })),
  };
  return { ...base, ...overrides } as unknown as KaitenSDK;
}

describe('mcp tool registry', () => {
  test('keeps the frozen 58-tool prefix and only appends additive tools', () => {
    expect(tools.length).toBeGreaterThanOrEqual(58);
  });

  test('tool names match the old server list exactly, in order', () => {
    expect(tools.slice(0, OLD_TOOLS.length).map((t) => t.name)).toEqual(OLD_TOOLS.map((t) => t.name));
  });

  test('no duplicate tool names', () => {
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  for (const expected of OLD_TOOLS) {
    test(`${expected.name}: required params match old JSON schema`, () => {
      const tool = toolByName(expected.name);
      const actualRequired = requiredParams(tool.inputSchema as any).sort();
      expect(actualRequired).toEqual([...expected.required].sort());
    });
  }
});

describe('mcp tool handlers - delegation to SDK', () => {
  test('kaiten_card defaults simple=true when omitted', async () => {
    const getCard = mock(async () => ({ id: 1 }));
    const sdk = makeStubSdk({ getCard });
    await toolByName('kaiten_card').handler(sdk, { cardId: 1 });
    expect(getCard).toHaveBeenCalledWith(1, true);
  });

  test('kaiten_card passes simple=false when explicitly set', async () => {
    const getCard = mock(async () => ({ id: 1 }));
    const sdk = makeStubSdk({ getCard });
    await toolByName('kaiten_card').handler(sdk, { cardId: 1, simple: false });
    expect(getCard).toHaveBeenCalledWith(1, false);
  });

  test('kaiten_card treats simple=true explicitly the same as default', async () => {
    const getCard = mock(async () => ({ id: 1 }));
    const sdk = makeStubSdk({ getCard });
    await toolByName('kaiten_card').handler(sdk, { cardId: 1, simple: true });
    expect(getCard).toHaveBeenCalledWith(1, true);
  });

  test('kaiten_cards minimal flag defaults to false', async () => {
    const getCards = mock(async () => []);
    const sdk = makeStubSdk({ getCards });
    await toolByName('kaiten_cards').handler(sdk, {});
    expect(getCards).toHaveBeenCalledWith(null, null, false, NO_LIST_OPTIONS);
  });

  test('kaiten_cards minimal=true is passed through', async () => {
    const getCards = mock(async () => []);
    const sdk = makeStubSdk({ getCards });
    await toolByName('kaiten_cards').handler(sdk, { spaceId: 5, boardId: 9, minimal: true });
    expect(getCards).toHaveBeenCalledWith(5, 9, true, NO_LIST_OPTIONS);
  });

  test('kaiten_cards minimal only becomes true for boolean true (not truthy values)', async () => {
    const getCards = mock(async () => []);
    const sdk = makeStubSdk({ getCards });
    await toolByName('kaiten_cards').handler(sdk, { minimal: 'yes' as unknown as boolean });
    expect(getCards).toHaveBeenCalledWith(null, null, false, NO_LIST_OPTIONS);
  });

  test('kaiten_cards forwards condition/limit/offset/orderBy/orderDirection to the SDK', async () => {
    const getCards = mock(async () => []);
    const sdk = makeStubSdk({ getCards });
    await toolByName('kaiten_cards').handler(sdk, { condition: 2, limit: 300, offset: 50, orderBy: 'created', orderDirection: 'asc' });
    expect(getCards).toHaveBeenCalledWith(null, null, false, { condition: 2, limit: 300, offset: 50, orderBy: 'created', orderDirection: 'asc' });
  });

  test('kaiten_update_card JSON.parses the legacy data string param (backward compat)', async () => {
    const updateCard = mock(async () => ({ id: 1 }));
    const sdk = makeStubSdk({ updateCard });
    await toolByName('kaiten_update_card').handler(sdk, { cardId: 7, data: '{"title":"new title","size":3}' });
    expect(updateCard).toHaveBeenCalledWith(7, { title: 'new title', size: 3 });
  });

  test('kaiten_update_card propagates JSON.parse errors for malformed data', async () => {
    const sdk = makeStubSdk();
    await expect(toolByName('kaiten_update_card').handler(sdk, { cardId: 7, data: 'not json' })).rejects.toThrow();
  });

  test('kaiten_update_card maps structured fields to a snake_case patch', async () => {
    const updateCard = mock(async () => ({ id: 1 }));
    const sdk = makeStubSdk({ updateCard });
    await toolByName('kaiten_update_card').handler(sdk, {
      cardId: 7,
      title: 'New title',
      description: 'New description',
      columnId: 10,
      laneId: 20,
      boardId: 30,
      size: 5,
      plannedStart: '2026-08-01',
      plannedEnd: '2026-08-10',
      dueDate: '2026-08-15',
      asap: true,
      condition: 1,
    });
    expect(updateCard).toHaveBeenCalledWith(7, {
      title: 'New title',
      description: 'New description',
      column_id: 10,
      lane_id: 20,
      board_id: 30,
      size: 5,
      planned_start: '2026-08-01',
      planned_end: '2026-08-10',
      due_date: '2026-08-15',
      asap: true,
      condition: 1,
    });
  });

  test('kaiten_update_card overlays explicit structured fields over the legacy data string', async () => {
    const updateCard = mock(async () => ({ id: 1 }));
    const sdk = makeStubSdk({ updateCard });
    await toolByName('kaiten_update_card').handler(sdk, {
      cardId: 7,
      data: '{"title":"from data","size":3}',
      title: 'from explicit field',
    });
    expect(updateCard).toHaveBeenCalledWith(7, { title: 'from explicit field', size: 3 });
  });

  test('kaiten_update_card throws when neither data nor any structured field is given', async () => {
    const sdk = makeStubSdk();
    await expect(toolByName('kaiten_update_card').handler(sdk, { cardId: 7 })).rejects.toThrow(
      'No fields to update - pass at least one field'
    );
  });

  test('kaiten_create_card passes laneId through to sdk.createCard', async () => {
    const createCard = mock(async () => ({ id: 1 }));
    const sdk = makeStubSdk({ createCard });
    await toolByName('kaiten_create_card').handler(sdk, {
      title: 'T',
      boardId: 1,
      columnId: 2,
      description: 'D',
      laneId: 42,
    });
    expect(createCard).toHaveBeenCalledWith({
      title: 'T',
      boardId: 1,
      columnId: 2,
      description: 'D',
      laneId: 42,
      tags: undefined,
      size: undefined,
      plannedStart: undefined,
      plannedEnd: undefined,
    });
  });

  test('kaiten_create_card works without laneId (undefined passthrough)', async () => {
    const createCard = mock(async () => ({ id: 1 }));
    const sdk = makeStubSdk({ createCard });
    await toolByName('kaiten_create_card').handler(sdk, { title: 'T', boardId: 1, columnId: 2 });
    expect(createCard).toHaveBeenCalledWith({
      title: 'T',
      boardId: 1,
      columnId: 2,
      description: undefined,
      laneId: undefined,
      tags: undefined,
      size: undefined,
      plannedStart: undefined,
      plannedEnd: undefined,
    });
  });

  test('kaiten_create_card passes tags/size/plannedStart/plannedEnd through to sdk.createCard', async () => {
    const createCard = mock(async () => ({ id: 1 }));
    const sdk = makeStubSdk({ createCard });
    await toolByName('kaiten_create_card').handler(sdk, {
      title: 'T',
      boardId: 1,
      columnId: 2,
      tags: ['bug', 'urgent'],
      size: 8,
      plannedStart: '2026-08-01',
      plannedEnd: '2026-08-10',
    });
    expect(createCard).toHaveBeenCalledWith({
      title: 'T',
      boardId: 1,
      columnId: 2,
      description: undefined,
      laneId: undefined,
      tags: ['bug', 'urgent'],
      size: 8,
      plannedStart: '2026-08-01',
      plannedEnd: '2026-08-10',
    });
  });

  test('kaiten_move_card passes laneId through to sdk.moveToColumn', async () => {
    const moveToColumn = mock(async () => ({ success: true }));
    const sdk = makeStubSdk({ moveToColumn });
    await toolByName('kaiten_move_card').handler(sdk, { cardId: 1, columnId: 3, laneId: 9 });
    expect(moveToColumn).toHaveBeenCalledWith(1, 3, 9);
  });

  test('kaiten_move_card defaults laneId to null when omitted', async () => {
    const moveToColumn = mock(async () => ({ success: true }));
    const sdk = makeStubSdk({ moveToColumn });
    await toolByName('kaiten_move_card').handler(sdk, { cardId: 1, columnId: 3 });
    expect(moveToColumn).toHaveBeenCalledWith(1, 3, null);
  });

  test('kaiten_find_cards filters by tag name and projects 5 fields', async () => {
    const cards = [
      { id: 1, title: 'A', board_id: 10, column_id: 20, tags: [{ id: 1, name: 'bug' }], description: 'x' },
      { id: 2, title: 'B', board_id: 10, column_id: 21, tags: [{ id: 2, name: 'feature' }], description: 'y' },
      { id: 3, title: 'C', board_id: 10, column_id: 22, tags: [], description: 'z' },
    ];
    const getCards = mock(async () => cards);
    const sdk = makeStubSdk({ getCards });
    const result = await toolByName('kaiten_find_cards').handler(sdk, { tagName: 'bug' });
    expect(getCards).toHaveBeenCalledWith(null, null);
    expect(result).toEqual([{ id: 1, title: 'A', board_id: 10, column_id: 20, tags: [{ id: 1, name: 'bug' }] }]);
  });

  test('kaiten_find_cards passes boardId through and handles cards with no tags', async () => {
    const cards = [{ id: 1, title: 'A', board_id: 10, column_id: 20 }];
    const getCards = mock(async () => cards);
    const sdk = makeStubSdk({ getCards });
    const result = await toolByName('kaiten_find_cards').handler(sdk, { tagName: 'bug', boardId: 10 });
    expect(getCards).toHaveBeenCalledWith(null, 10);
    expect(result).toEqual([]);
  });

  test('kaiten_clean_temp extracts cardId from a dir path and returns {deleted}', async () => {
    const cleanTempDir = mock(async () => 3);
    const sdk = makeStubSdk({ cleanTempDir });
    const result = await toolByName('kaiten_clean_temp').handler(sdk, { dir: '/tmp/kaiten/456/' });
    expect(cleanTempDir).toHaveBeenCalledWith(456);
    expect(result).toEqual({ deleted: 3 });
  });

  test('kaiten_clean_temp passes null cardId when dir has no /kaiten/{id} pattern', async () => {
    const cleanTempDir = mock(async () => 7);
    const sdk = makeStubSdk({ cleanTempDir });
    const result = await toolByName('kaiten_clean_temp').handler(sdk, { dir: '/tmp/other-dir' });
    expect(cleanTempDir).toHaveBeenCalledWith(null);
    expect(result).toEqual({ deleted: 7 });
  });

  test('kaiten_clean_temp passes null cardId when dir is omitted entirely', async () => {
    const cleanTempDir = mock(async () => 0);
    const sdk = makeStubSdk({ cleanTempDir });
    const result = await toolByName('kaiten_clean_temp').handler(sdk, {});
    expect(cleanTempDir).toHaveBeenCalledWith(null);
    expect(result).toEqual({ deleted: 0 });
  });

  test('kaiten_spaces delegates to sdk.getSpaces with no args', async () => {
    const getSpaces = mock(async () => [{ id: 1, title: 'S' }]);
    const sdk = makeStubSdk({ getSpaces });
    const result = await toolByName('kaiten_spaces').handler(sdk, {});
    expect(getSpaces).toHaveBeenCalledWith();
    expect(result).toEqual([{ id: 1, title: 'S' }]);
  });

  test('kaiten_delete_card delegates to sdk.deleteCard(cardId)', async () => {
    const deleteCard = mock(async () => ({ ok: true }));
    const sdk = makeStubSdk({ deleteCard });
    await toolByName('kaiten_delete_card').handler(sdk, { cardId: 55 });
    expect(deleteCard).toHaveBeenCalledWith(55);
  });

  test('kaiten_assign_card delegates to sdk.assignTo(cardId, userId)', async () => {
    const assignTo = mock(async () => ({ success: true }));
    const sdk = makeStubSdk({ assignTo });
    await toolByName('kaiten_assign_card').handler(sdk, { cardId: 1, userId: 2 });
    expect(assignTo).toHaveBeenCalledWith(1, 2);
  });

  test('kaiten_get_child_cards delegates to sdk.getSubtasks(cardId, true)', async () => {
    const getSubtasks = mock(async () => []);
    const sdk = makeStubSdk({ getSubtasks });
    await toolByName('kaiten_get_child_cards').handler(sdk, { cardId: 4 });
    expect(getSubtasks).toHaveBeenCalledWith(4, true);
  });

  test('kaiten_get_all_child_cards delegates to sdk.getAllSubtasks(cardId, true)', async () => {
    const getAllSubtasks = mock(async () => []);
    const sdk = makeStubSdk({ getAllSubtasks });
    await toolByName('kaiten_get_all_child_cards').handler(sdk, { cardId: 4 });
    expect(getAllSubtasks).toHaveBeenCalledWith(4, true);
  });

  test('kaiten_get_parent delegates to sdk.getParent(cardId, true)', async () => {
    const getParent = mock(async () => null);
    const sdk = makeStubSdk({ getParent });
    await toolByName('kaiten_get_parent').handler(sdk, { cardId: 4 });
    expect(getParent).toHaveBeenCalledWith(4, true);
  });

  test('kaiten_update_checklist wraps name into a data object', async () => {
    const updateChecklist = mock(async () => ({ id: 1 }));
    const sdk = makeStubSdk({ updateChecklist });
    await toolByName('kaiten_update_checklist').handler(sdk, { cardId: 1, checklistId: 2, name: 'New name' });
    expect(updateChecklist).toHaveBeenCalledWith(1, 2, { name: 'New name' });
  });

  test('kaiten_toggle_checklist_item passes checked through', async () => {
    const toggleChecklistItem = mock(async () => ({ id: 1 }));
    const sdk = makeStubSdk({ toggleChecklistItem });
    await toolByName('kaiten_toggle_checklist_item').handler(sdk, {
      cardId: 1,
      checklistId: 2,
      itemId: 3,
      checked: false,
    });
    expect(toggleChecklistItem).toHaveBeenCalledWith(1, 2, 3, false);
  });

  test('kaiten_download_file delegates with outputDir', async () => {
    const downloadFileToDisk = mock(async () => ({ path: '/tmp/x' }));
    const sdk = makeStubSdk({ downloadFileToDisk });
    await toolByName('kaiten_download_file').handler(sdk, { cardId: 1, fileId: 2, outputDir: '/tmp/out' });
    expect(downloadFileToDisk).toHaveBeenCalledWith(1, 2, '/tmp/out');
  });

  test('kaiten_download_all_files delegates with null outputDir when omitted', async () => {
    const downloadAllCardFiles = mock(async () => []);
    const sdk = makeStubSdk({ downloadAllCardFiles });
    await toolByName('kaiten_download_all_files').handler(sdk, { cardId: 1 });
    expect(downloadAllCardFiles).toHaveBeenCalledWith(1, null);
  });

  test('kaiten_git_status delegates to sdk.getGitStatus with no args', async () => {
    const getGitStatus = mock(async () => 'clean');
    const sdk = makeStubSdk({ getGitStatus });
    const result = await toolByName('kaiten_git_status').handler(sdk, {});
    expect(getGitStatus).toHaveBeenCalledWith();
    expect(result).toBe('clean');
  });

  test('kaiten_search_users delegates to sdk.findUser(query)', async () => {
    const findUser = mock(async () => ({ id: 1, full_name: 'Alice' }));
    const sdk = makeStubSdk({ findUser });
    await toolByName('kaiten_search_users').handler(sdk, { query: 'Alice' });
    expect(findUser).toHaveBeenCalledWith('Alice');
  });
});

describe('mcp tool handlers - 3.1.0 additive tools', () => {
  test('kaiten_lanes delegates to sdk.getLanes(boardId)', async () => {
    const getLanes = mock(async () => [{ id: 1, title: 'Lane', board_id: 9 }]);
    const sdk = makeStubSdk({ getLanes });
    const result = await toolByName('kaiten_lanes').handler(sdk, { boardId: 9 });
    expect(getLanes).toHaveBeenCalledWith(9);
    expect(result).toEqual([{ id: 1, title: 'Lane', board_id: 9 }]);
  });

  test('kaiten_update_comment delegates to sdk.updateComment(commentId, text)', async () => {
    const updateComment = mock(async () => ({ id: 5 }));
    const sdk = makeStubSdk({ updateComment });
    await toolByName('kaiten_update_comment').handler(sdk, { commentId: 5, text: 'edited' });
    expect(updateComment).toHaveBeenCalledWith(5, 'edited');
  });

  test('kaiten_delete_comment delegates to sdk.deleteComment(commentId)', async () => {
    const deleteComment = mock(async () => undefined);
    const sdk = makeStubSdk({ deleteComment });
    await toolByName('kaiten_delete_comment').handler(sdk, { commentId: 5 });
    expect(deleteComment).toHaveBeenCalledWith(5);
  });

  test('kaiten_archive_card delegates to sdk.archive(cardId)', async () => {
    const archive = mock(async () => ({ id: 1, condition: 2 }));
    const sdk = makeStubSdk({ archive });
    await toolByName('kaiten_archive_card').handler(sdk, { cardId: 1 });
    expect(archive).toHaveBeenCalledWith(1);
  });

  test('kaiten_unarchive_card delegates to sdk.unarchive(cardId)', async () => {
    const unarchive = mock(async () => ({ id: 1, condition: 1 }));
    const sdk = makeStubSdk({ unarchive });
    await toolByName('kaiten_unarchive_card').handler(sdk, { cardId: 1 });
    expect(unarchive).toHaveBeenCalledWith(1);
  });

  test('kaiten_unassign_card delegates to sdk.unassignFrom(cardId, userId)', async () => {
    const unassignFrom = mock(async () => ({ id: 1 }));
    const sdk = makeStubSdk({ unassignFrom });
    await toolByName('kaiten_unassign_card').handler(sdk, { cardId: 1, userId: 2 });
    expect(unassignFrom).toHaveBeenCalledWith(1, 2);
  });
});

describe('mcp tool handlers - 3.2.0 additive tools', () => {
  test('kaiten_create_card passes typeId through to sdk.createCard', async () => {
    const createCard = mock(async () => ({ id: 1 }));
    const sdk = makeStubSdk({ createCard });
    await toolByName('kaiten_create_card').handler(sdk, { title: 'T', boardId: 1, columnId: 2, typeId: 3 });
    expect(createCard).toHaveBeenCalledWith(expect.objectContaining({ typeId: 3 }));
  });

  test('kaiten_current_user delegates to sdk.getCurrentUser with no args', async () => {
    const getCurrentUser = mock(async () => ({ id: 1, full_name: 'Me' }));
    const sdk = makeStubSdk({ getCurrentUser });
    const result = await toolByName('kaiten_current_user').handler(sdk, {});
    expect(getCurrentUser).toHaveBeenCalledWith();
    expect(result).toEqual({ id: 1, full_name: 'Me' });
  });

  test('kaiten_tags delegates to sdk.listTags(query, spaceId)', async () => {
    const listTags = mock(async () => [{ id: 1, name: 'bug' }]);
    const sdk = makeStubSdk({ listTags });
    await toolByName('kaiten_tags').handler(sdk, { query: 'bug', spaceId: 9 });
    expect(listTags).toHaveBeenCalledWith('bug', 9);
  });

  test('kaiten_tags works with no args', async () => {
    const listTags = mock(async () => []);
    const sdk = makeStubSdk({ listTags });
    await toolByName('kaiten_tags').handler(sdk, {});
    expect(listTags).toHaveBeenCalledWith(undefined, undefined);
  });

  test('kaiten_card_types delegates to sdk.getCardTypes with no args', async () => {
    const getCardTypes = mock(async () => [{ id: 1, name: 'Bug' }]);
    const sdk = makeStubSdk({ getCardTypes });
    const result = await toolByName('kaiten_card_types').handler(sdk, {});
    expect(getCardTypes).toHaveBeenCalledWith();
    expect(result).toEqual([{ id: 1, name: 'Bug' }]);
  });

  test('kaiten_custom_properties delegates to sdk.getCustomProperties with no args', async () => {
    const getCustomProperties = mock(async () => [{ id: 1, name: 'Priority' }]);
    const sdk = makeStubSdk({ getCustomProperties });
    const result = await toolByName('kaiten_custom_properties').handler(sdk, {});
    expect(getCustomProperties).toHaveBeenCalledWith();
    expect(result).toEqual([{ id: 1, name: 'Priority' }]);
  });

  test('kaiten_get_time_logs delegates to sdk.getTimeLogs(cardId)', async () => {
    const getTimeLogs = mock(async () => [{ id: 1, time_spent: 30 }]);
    const sdk = makeStubSdk({ getTimeLogs });
    await toolByName('kaiten_get_time_logs').handler(sdk, { cardId: 5 });
    expect(getTimeLogs).toHaveBeenCalledWith(5);
  });

  test('kaiten_add_time_log delegates to sdk.addTimeLog(cardId, timeSpent, forDate, roleId, comment)', async () => {
    const addTimeLog = mock(async () => ({ id: 1 }));
    const sdk = makeStubSdk({ addTimeLog });
    await toolByName('kaiten_add_time_log').handler(sdk, {
      cardId: 5,
      timeSpent: 30,
      forDate: '2026-07-20',
      roleId: 7,
      comment: 'debugging',
    });
    expect(addTimeLog).toHaveBeenCalledWith(5, 30, '2026-07-20', 7, 'debugging');
  });

  test('kaiten_get_blockers delegates to sdk.getBlockers(cardId)', async () => {
    const getBlockers = mock(async () => []);
    const sdk = makeStubSdk({ getBlockers });
    await toolByName('kaiten_get_blockers').handler(sdk, { cardId: 5 });
    expect(getBlockers).toHaveBeenCalledWith(5);
  });

  test('kaiten_block_card delegates to sdk.blockCard(cardId, reason, blockerCardId)', async () => {
    const blockCard = mock(async () => ({ id: 1 }));
    const sdk = makeStubSdk({ blockCard });
    await toolByName('kaiten_block_card').handler(sdk, { cardId: 5, reason: 'waiting', blockerCardId: 9 });
    expect(blockCard).toHaveBeenCalledWith(5, 'waiting', 9);
  });

  test('kaiten_unblock_card delegates to sdk.unblockCard(cardId, blockerId)', async () => {
    const unblockCard = mock(async () => ({ ok: true }));
    const sdk = makeStubSdk({ unblockCard });
    await toolByName('kaiten_unblock_card').handler(sdk, { cardId: 5, blockerId: 3 });
    expect(unblockCard).toHaveBeenCalledWith(5, 3);
  });

  test('kaiten_get_external_links delegates to sdk.getExternalLinks(cardId)', async () => {
    const getExternalLinks = mock(async () => []);
    const sdk = makeStubSdk({ getExternalLinks });
    await toolByName('kaiten_get_external_links').handler(sdk, { cardId: 5 });
    expect(getExternalLinks).toHaveBeenCalledWith(5);
  });

  test('kaiten_add_external_link delegates to sdk.addExternalLink(cardId, url, description)', async () => {
    const addExternalLink = mock(async () => ({ id: 1 }));
    const sdk = makeStubSdk({ addExternalLink });
    await toolByName('kaiten_add_external_link').handler(sdk, { cardId: 5, url: 'https://example.com', description: 'PR' });
    expect(addExternalLink).toHaveBeenCalledWith(5, 'https://example.com', 'PR');
  });

  test('kaiten_remove_external_link delegates to sdk.removeExternalLink(cardId, linkId)', async () => {
    const removeExternalLink = mock(async () => ({ ok: true }));
    const sdk = makeStubSdk({ removeExternalLink });
    await toolByName('kaiten_remove_external_link').handler(sdk, { cardId: 5, linkId: 3 });
    expect(removeExternalLink).toHaveBeenCalledWith(5, 3);
  });

  test('kaiten_attach_file delegates to sdk.attachFile(cardId, filePath, fileName)', async () => {
    const attachFile = mock(async () => ({ id: 1, name: 'a.txt' }));
    const sdk = makeStubSdk({ attachFile });
    await toolByName('kaiten_attach_file').handler(sdk, { cardId: 5, filePath: '/tmp/a.txt', fileName: 'a.txt' });
    expect(attachFile).toHaveBeenCalledWith(5, '/tmp/a.txt', 'a.txt');
  });
});

describe('mcp tool annotations', () => {
  test('read-only tools are marked readOnlyHint: true', () => {
    for (const name of [
      'kaiten_spaces',
      'kaiten_cards',
      'kaiten_card',
      'kaiten_lanes',
      'kaiten_get_checklists',
      'kaiten_current_user',
      'kaiten_tags',
      'kaiten_card_types',
      'kaiten_custom_properties',
      'kaiten_get_time_logs',
      'kaiten_get_blockers',
      'kaiten_get_external_links',
    ]) {
      expect(toolByName(name).annotations?.readOnlyHint).toBe(true);
    }
  });

  test('destructive tools are marked destructiveHint: true', () => {
    for (const name of [
      'kaiten_delete_card',
      'kaiten_delete_comment',
      'kaiten_remove_tag',
      'kaiten_clean_temp',
      'kaiten_unblock_card',
      'kaiten_remove_external_link',
    ]) {
      expect(toolByName(name).annotations?.destructiveHint).toBe(true);
    }
  });

  test('kaiten_unblock_card and kaiten_remove_external_link descriptions require KAITEN_API_DELETE_ALLOW', () => {
    expect(toolByName('kaiten_unblock_card').description).toContain('KAITEN_API_DELETE_ALLOW=true');
    expect(toolByName('kaiten_remove_external_link').description).toContain('KAITEN_API_DELETE_ALLOW=true');
  });

  test('mutating non-destructive tools carry no annotations by default', () => {
    expect(toolByName('kaiten_create_card').annotations).toBeUndefined();
    expect(toolByName('kaiten_assign_card').annotations).toBeUndefined();
  });
});
