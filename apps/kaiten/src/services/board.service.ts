import { inject, injectable } from 'inversify';
import type { Board, Column, KaitenApiPort, KaitenConfig, Lane, Space } from '../kaiten';
import { TOKENS } from '../di/tokens';
import type { AccessGuard } from './guard';

@injectable()
export class BoardService {
  constructor(
    @inject(TOKENS.KaitenApi) private readonly api: KaitenApiPort,
    @inject(TOKENS.AccessGuard) private readonly guard: AccessGuard,
    @inject(TOKENS.Config) private readonly config: Pick<KaitenConfig, 'defaultSpaceId' | 'allowedSpaceIds'>
  ) {}

  async getSpaces(): Promise<Space[]> {
    const spaces = await this.api.boards.getSpaces();
    if (!this.config.allowedSpaceIds) return spaces;
    return spaces.filter((s) => this.config.allowedSpaceIds!.includes(s.id));
  }

  async getSpaceId(spaceTitle: string | number): Promise<number> {
    const spaces = await this.api.boards.getSpaces();
    const space = spaces.find((s) => s.title === spaceTitle || s.id === spaceTitle);
    if (!space) {
      throw new Error(`Space "${spaceTitle}" not found`);
    }
    return space.id;
  }

  /** Note: shadows nothing - the old SDK had a dead first `getBoardId(boardTitle, spaceId)` overload
   * that was silently overridden by this one (JS classes allow duplicate method names; the last
   * definition wins at runtime). This is the only definition that was ever actually callable. */
  async getBoardId(spaceId: number, boardTitle: string): Promise<number> {
    const boards = await this.api.boards.getBoards(spaceId);
    const board = boards.find((b) => b.title === boardTitle);
    if (!board) {
      throw new Error(`Board "${boardTitle}" not found`);
    }
    return board.id;
  }

  async getColumnId(boardId: number, columnTitle: string): Promise<number> {
    this.guard.validateBoardId(boardId);
    const columns = await this.api.boards.getColumns(boardId);
    const column = columns.find((c) => c.title === columnTitle);
    if (!column) {
      throw new Error(`Column "${columnTitle}" not found`);
    }
    return column.id;
  }

  getBoards(spaceId: number | null = null): Promise<Board[]> {
    const id = spaceId || this.config.defaultSpaceId;
    if (!id) {
      throw new Error('Space ID is required. Set KAITEN_DEFAULT_SPACE_ID or pass spaceId parameter.');
    }
    this.guard.validateSpaceId(id);
    return this.api.boards.getBoards(id);
  }

  getColumns(boardId: number): Promise<Column[]> {
    this.guard.validateBoardId(boardId);
    return this.api.boards.getColumns(boardId);
  }

  getLanes(boardId: number): Promise<Lane[]> {
    this.guard.validateBoardId(boardId);
    return this.api.boards.getLanes(boardId);
  }
}
