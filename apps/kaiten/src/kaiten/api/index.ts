import type { HttpTransport, KaitenApiPort } from '../interfaces';
import { BlockersApi } from './blockers';
import { BoardsApi } from './boards';
import { CardsApi } from './cards';
import { CommentsApi } from './comments';
import { CompanyApi } from './company';
import { FilesApi } from './files';
import { LinksApi } from './links';
import { SubtasksApi } from './subtasks';
import { TimeLogsApi } from './timelogs';
import { UsersApi } from './users';

export { BlockersApi } from './blockers';
export { BoardsApi } from './boards';
export { CardsApi } from './cards';
export type { CardListOptions } from './cards';
export { CommentsApi } from './comments';
export { CompanyApi } from './company';
export { FilesApi } from './files';
export { LinksApi } from './links';
export { SubtasksApi } from './subtasks';
export { TimeLogsApi } from './timelogs';
export { UsersApi } from './users';

export class KaitenApi implements KaitenApiPort {
  readonly cards: CardsApi;
  readonly boards: BoardsApi;
  readonly comments: CommentsApi;
  readonly files: FilesApi;
  readonly subtasks: SubtasksApi;
  readonly users: UsersApi;
  readonly timeLogs: TimeLogsApi;
  readonly blockers: BlockersApi;
  readonly links: LinksApi;
  readonly company: CompanyApi;

  constructor(client: HttpTransport) {
    this.cards = new CardsApi(client);
    this.boards = new BoardsApi(client);
    this.comments = new CommentsApi(client);
    this.files = new FilesApi(client);
    this.subtasks = new SubtasksApi(client);
    this.users = new UsersApi(client);
    this.timeLogs = new TimeLogsApi(client);
    this.blockers = new BlockersApi(client);
    this.links = new LinksApi(client);
    this.company = new CompanyApi(client);
  }
}
