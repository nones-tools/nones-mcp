import type {
  Board, Card, CardBlocker, CardFile, CardListOptions, CardType,
  Checklist, ChecklistItem, Column, Comment, CustomProperty,
  ExternalLink, KaitenApi, KaitenClient, KaitenConfig, Lane, Space, Tag, TimeLog, User,
} from './kaiten';
import { buildContainer } from './di/container';
import { TOKENS } from './di/tokens';
import type {
  BlockerService, BoardService, CardService, ChecklistService, CommentService,
  DictionaryService, FileService, GitService, HierarchyService, LinkService, TagService,
  TimeLogService, UserService,
  CreateCardInput, MinimalCard, MinimalParent, MinimalSubtask, TaggedCard, TaskFlowTask,
} from './services';

export type { CreateCardInput, MinimalCard, MinimalParent, MinimalSubtask, TaggedCard, TaskFlowTask } from './services';

export interface KaitenSDKOptions extends Partial<KaitenConfig> {
  client?: KaitenClient;
}

/**
 * Facade over the Kaiten Core plus the business-logic services in
 * src/services/ (allowlist guard, minimal projections, domain services,
 * git/temp helpers). Every public method is a one-line delegation. This is
 * the package's public API - adapters (MCP, CLI) call this and never raw
 * HTTP.
 *
 * Internally builds a fresh DI container (see src/di/) per instance and
 * pulls every dependency from it via `TOKENS` - `buildContainer` is also
 * where `KaitenClient`/`KaitenApi` get constructed (factory bindings) and
 * every service is wired with its `@injectable`/`@inject` metadata. The
 * public constructor signature - `Partial<KaitenConfig>` overrides plus an
 * optional injected `client` - is unchanged from the pre-DI implementation,
 * so existing call sites (`new KaitenSDK(options)`, `createSDK(options)`)
 * and tests keep working without modification.
 */
export class KaitenSDK {
  readonly config: KaitenConfig;
  readonly client: KaitenClient;
  readonly api: KaitenApi;

  private readonly cards: CardService;
  private readonly tags: TagService;
  private readonly hierarchy: HierarchyService;
  private readonly comments: CommentService;
  private readonly boards: BoardService;
  private readonly users: UserService;
  private readonly git: GitService;
  private readonly files: FileService;
  private readonly checklists: ChecklistService;
  private readonly timeLogs: TimeLogService;
  private readonly blockers: BlockerService;
  private readonly links: LinkService;
  private readonly dictionaries: DictionaryService;

  constructor(options: KaitenSDKOptions = {}) {
    const container = buildContainer(options);
    this.config = container.get(TOKENS.Config);
    // The container only ever constructs a `KaitenClient`/`KaitenApi` (see
    // src/di/container.ts) or returns the caller's injected `client`, whose
    // declared type on `KaitenSDKOptions` is already `KaitenClient` - so
    // both casts below just recover the concrete type from the token's
    // wider port type (`HttpTransport`/`KaitenApiPort`).
    this.client = container.get(TOKENS.HttpTransport) as KaitenClient;
    this.api = container.get(TOKENS.KaitenApi) as KaitenApi;

    this.cards = container.get(TOKENS.CardService);
    this.tags = container.get(TOKENS.TagService);
    this.hierarchy = container.get(TOKENS.HierarchyService);
    this.comments = container.get(TOKENS.CommentService);
    this.boards = container.get(TOKENS.BoardService);
    this.users = container.get(TOKENS.UserService);
    this.git = container.get(TOKENS.GitService);
    this.files = container.get(TOKENS.FileService);
    this.checklists = container.get(TOKENS.ChecklistService);
    this.timeLogs = container.get(TOKENS.TimeLogService);
    this.blockers = container.get(TOKENS.BlockerService);
    this.links = container.get(TOKENS.LinkService);
    this.dictionaries = container.get(TOKENS.DictionaryService);
  }

  // Cards
  getCards(spaceId: number | null = null, boardId: number | null = null, minimal = false, options: CardListOptions = {}): Promise<Card[] | MinimalCard[]> { return this.cards.getCards(spaceId, boardId, minimal, options); }
  getCard(cardId: number, minimal = false): Promise<Card | MinimalCard> { return this.cards.getCard(cardId, minimal); }
  createCard(input: CreateCardInput): Promise<Card> { return this.cards.createCard(input); }
  updateCard(cardId: number, data: Record<string, unknown>): Promise<Card> { return this.cards.updateCard(cardId, data); }
  deleteCard(cardId: number): Promise<unknown> { return this.cards.deleteCard(cardId); }
  moveToColumn(cardId: number, columnId: number, laneId: number | null = null) { return this.cards.moveToColumn(cardId, columnId, laneId); }
  assignTo(cardId: number, userId: number) { return this.cards.assignTo(cardId, userId); }
  unassignFrom(cardId: number, userId: number): Promise<Card> { return this.cards.unassignFrom(cardId, userId); }
  archive(cardId: number): Promise<Card> { return this.cards.archive(cardId); }
  unarchive(cardId: number): Promise<Card> { return this.cards.unarchive(cardId); }

  // Tags
  addTag(cardId: number, tagName: string): Promise<TaggedCard> { return this.tags.addTag(cardId, tagName); }
  removeTag(cardId: number, tagName: string): Promise<TaggedCard> { return this.tags.removeTag(cardId, tagName); }
  setTags(cardId: number, tagNames: string[]): Promise<Card> { return this.tags.setTags(cardId, tagNames); }
  hasTag(card: Card, tagName: string): boolean { return this.tags.hasTag(card, tagName); }
  getTags(card: Card): string[] { return this.tags.getTags(card); }
  getCardsWithTag(tagName: string, spaceId: number | null = null): Promise<Card[]> { return this.tags.getCardsWithTag(tagName, spaceId); }
  getCardsWithoutTag(tagName: string, spaceId: number | null = null): Promise<Card[]> { return this.tags.getCardsWithoutTag(tagName, spaceId); }

  // Hierarchy (subtasks / parents)
  createSubtask(parentId: number, title: string, position = 0): Promise<Card> { return this.hierarchy.createSubtask(parentId, title, position); }
  getSubtasks(cardId: number, minimal = false): Promise<Card[] | MinimalSubtask[]> { return this.hierarchy.getSubtasks(cardId, minimal); }
  getAllSubtasks(cardId: number, minimal = false): Promise<Card[] | MinimalSubtask[]> { return this.hierarchy.getAllSubtasks(cardId, minimal); }
  getParent(cardId: number, minimal = false): Promise<Card | MinimalParent | null> { return this.hierarchy.getParent(cardId, minimal); }
  attachToParent(cardId: number, parentId: number, position = 0): Promise<unknown> { return this.hierarchy.attachToParent(cardId, parentId, position); }
  detachFromParent(cardId: number): Promise<unknown> { return this.hierarchy.detachFromParent(cardId); }
  createTaskFlow(parentCard: number, tasks: TaskFlowTask[]): Promise<Record<string, unknown>[]> { return this.hierarchy.createTaskFlow(parentCard, tasks); }

  // Comments
  addComment(cardId: number, text: string, parentId: number | null = null): Promise<Comment> { return this.comments.addComment(cardId, text, parentId); }
  getComments(cardId: number): Promise<Comment[]> { return this.comments.getComments(cardId); }
  updateComment(commentId: number, text: string): Promise<Comment> { return this.comments.updateComment(commentId, text); }
  deleteComment(commentId: number): Promise<void> { return this.comments.deleteComment(commentId); }

  // Boards / spaces / columns
  getSpaces(): Promise<Space[]> { return this.boards.getSpaces(); }
  getSpaceId(spaceTitle: string | number): Promise<number> { return this.boards.getSpaceId(spaceTitle); }
  getBoardId(spaceId: number, boardTitle: string): Promise<number> { return this.boards.getBoardId(spaceId, boardTitle); }
  getColumnId(boardId: number, columnTitle: string): Promise<number> { return this.boards.getColumnId(boardId, columnTitle); }
  getBoards(spaceId: number | null = null): Promise<Board[]> { return this.boards.getBoards(spaceId); }
  getColumns(boardId: number): Promise<Column[]> { return this.boards.getColumns(boardId); }
  getLanes(boardId: number): Promise<Lane[]> { return this.boards.getLanes(boardId); }

  // Users
  findUser(query: string): Promise<User> { return this.users.findUser(query); }
  getCurrentUser(): Promise<User> { return this.users.getCurrentUser(); }
  getUsers(): Promise<User[]> { return this.users.getUsers(); }

  // Git
  getCurrentBranch(): Promise<string> { return this.git.getCurrentBranch(); }
  createGitBranch(cardId: number, title?: string): Promise<string> { return this.git.createGitBranch(cardId, title); }
  checkoutGitBranch(cardId: number, title?: string): Promise<string> { return this.git.checkoutGitBranch(cardId, title); }
  commitGit(cardId: number, message: string): Promise<void> { return this.git.commitGit(cardId, message); }
  getGitChanges(): Promise<string> { return this.git.getGitChanges(); }
  getGitStatus(): Promise<string> { return this.git.getGitStatus(); }
  gitAddAll(): Promise<void> { return this.git.gitAddAll(); }
  gitPush(cardId: number, title?: string): Promise<void> { return this.git.gitPush(cardId, title); }
  createPullRequest(cardId: number, title: string): Promise<void> { return this.git.createPullRequest(cardId, title); }

  // Files / temp dirs
  getCardFiles(cardId: number): Promise<CardFile[]> { return this.files.getCardFiles(cardId); }
  downloadFile(cardId: number, fileId: number): Promise<Buffer> { return this.files.downloadFile(cardId, fileId); }
  downloadFileToDisk(cardId: number, fileId: number, outputDir: string | null = null) { return this.files.downloadFileToDisk(cardId, fileId, outputDir); }
  downloadAllCardFiles(cardId: number, outputDir: string | null = null) { return this.files.downloadAllCardFiles(cardId, outputDir); }
  cleanTempDir(cardId: number | null = null): Promise<number> { return this.files.cleanTempDir(cardId); }

  // Checklists
  getChecklists(cardId: number): Promise<Checklist[]> { return this.checklists.getChecklists(cardId); }
  createChecklist(cardId: number, name: string): Promise<Checklist> { return this.checklists.createChecklist(cardId, name); }
  deleteChecklist(cardId: number, checklistId: number): Promise<unknown> { return this.checklists.deleteChecklist(cardId, checklistId); }
  updateChecklist(cardId: number, checklistId: number, data: Record<string, unknown>): Promise<Checklist> { return this.checklists.updateChecklist(cardId, checklistId, data); }
  toggleChecklistItem(cardId: number, checklistId: number, itemId: number, checked: boolean): Promise<ChecklistItem> { return this.checklists.toggleChecklistItem(cardId, checklistId, itemId, checked); }
  addChecklistItem(cardId: number, checklistId: number, text: string): Promise<ChecklistItem> { return this.checklists.addChecklistItem(cardId, checklistId, text); }
  deleteChecklistItem(cardId: number, checklistId: number, itemId: number): Promise<unknown> { return this.checklists.deleteChecklistItem(cardId, checklistId, itemId); }

  // Company dictionaries
  listTags(query?: string, spaceId?: number): Promise<Tag[]> { return this.dictionaries.getTags(query, spaceId); }
  getCardTypes(): Promise<CardType[]> { return this.dictionaries.getCardTypes(); }
  getCustomProperties(): Promise<CustomProperty[]> { return this.dictionaries.getCustomProperties(); }

  // Time logs
  getTimeLogs(cardId: number): Promise<TimeLog[]> { return this.timeLogs.getTimeLogs(cardId); }
  addTimeLog(cardId: number, timeSpent: number, forDate: string, roleId: number, comment?: string): Promise<TimeLog> { return this.timeLogs.addTimeLog(cardId, timeSpent, forDate, roleId, comment); }

  // Card blockers
  getBlockers(cardId: number): Promise<CardBlocker[]> { return this.blockers.getBlockers(cardId); }
  blockCard(cardId: number, reason?: string, blockerCardId?: number): Promise<CardBlocker> { return this.blockers.blockCard(cardId, reason, blockerCardId); }
  unblockCard(cardId: number, blockerId: number): Promise<unknown> { return this.blockers.unblockCard(cardId, blockerId); }

  // External links
  getExternalLinks(cardId: number): Promise<ExternalLink[]> { return this.links.getExternalLinks(cardId); }
  addExternalLink(cardId: number, url: string, description?: string): Promise<ExternalLink> { return this.links.addExternalLink(cardId, url, description); }
  removeExternalLink(cardId: number, linkId: number): Promise<unknown> { return this.links.removeExternalLink(cardId, linkId); }

  // Files - upload
  attachFile(cardId: number, filePath: string, fileName?: string): Promise<CardFile> { return this.files.attachFile(cardId, filePath, fileName); }
}

export function createSDK(options?: KaitenSDKOptions): KaitenSDK {
  return new KaitenSDK(options);
}
