/**
 * Port interfaces describing the public surface of `KaitenApi` and each
 * resource-group class in `src/kaiten/api/`. `src/services/*` depends on
 * these types (never the concrete classes), so app-layer code can be unit
 * tested against a fake and the DI container can bind the real classes
 * behind the same contract.
 *
 * The resource-level ports are derived via `Pick<...ApiClass, 'method'>` -
 * `import type` is fully erased at compile time, so referencing the classes
 * from `../api` here creates no runtime dependency back on them (`api/*.ts`
 * already depends on this directory for `HttpTransport`). This keeps
 * `src/kaiten/` self-contained: the reference only exists at the type level,
 * nothing under `src/kaiten/` imports or requires anything at runtime as a
 * result of it.
 */
import type {
  BlockersApi, BoardsApi, CardsApi, CommentsApi, CompanyApi,
  FilesApi, LinksApi, SubtasksApi, TimeLogsApi, UsersApi,
} from '../api';

export type BlockersApiPort = Pick<BlockersApi, 'getBlockers' | 'blockCard' | 'unblockCard'>;

export type BoardsApiPort = Pick<
  BoardsApi,
  'getSpaces' | 'getLanes' | 'getSpace' | 'getColumns' | 'getColumn' | 'getBoard' | 'getBoards'
>;

export type CardsApiPort = Pick<
  CardsApi,
  | 'getCards' | 'getCard' | 'createChecklist' | 'deleteChecklist' | 'updateChecklist'
  | 'createCard' | 'updateCard' | 'deleteCard' | 'moveCard' | 'assignCard' | 'unassignCard'
  | 'archiveCard' | 'unarchiveCard' | 'addTag' | 'removeTag' | 'setTags'
  | 'toggleChecklistItem' | 'addChecklistItem' | 'deleteChecklistItem'
>;

export type CommentsApiPort = Pick<CommentsApi, 'getComments' | 'getComment' | 'createComment' | 'updateComment' | 'deleteComment'>;

export type CompanyApiPort = Pick<CompanyApi, 'getTags' | 'getCardTypes' | 'getCustomProperties'>;

export type FilesApiPort = Pick<FilesApi, 'getCardFiles' | 'downloadFile' | 'attachFile'>;

export type LinksApiPort = Pick<LinksApi, 'getExternalLinks' | 'addExternalLink' | 'removeExternalLink'>;

export type SubtasksApiPort = Pick<
  SubtasksApi,
  | 'getSubtasks' | 'getAllSubtasks' | 'getParent' | 'createSubtask' | 'updateSubtask'
  | 'deleteSubtask' | 'toggleSubtaskComplete' | 'attachToParent' | 'detachFromParent'
>;

export type TimeLogsApiPort = Pick<TimeLogsApi, 'getTimeLogs' | 'addTimeLog'>;

export type UsersApiPort = Pick<UsersApi, 'getUsers' | 'getUser' | 'getCurrentUser' | 'searchUsers'>;

/**
 * Public surface of `KaitenApi`. Hand-written (not `Pick<KaitenApi, ...>`) so
 * each field is typed as its narrow `*ApiPort`, not the concrete resource
 * class - this is the aggregate type `src/services/*` and the DI tokens
 * depend on. `KaitenApi implements KaitenApiPort`.
 */
export interface KaitenApiPort {
  readonly cards: CardsApiPort;
  readonly boards: BoardsApiPort;
  readonly comments: CommentsApiPort;
  readonly files: FilesApiPort;
  readonly subtasks: SubtasksApiPort;
  readonly users: UsersApiPort;
  readonly timeLogs: TimeLogsApiPort;
  readonly blockers: BlockersApiPort;
  readonly links: LinksApiPort;
  readonly company: CompanyApiPort;
}
