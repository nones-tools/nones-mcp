import { inject, injectable } from 'inversify';
import type { Card, CardListOptions, KaitenApiPort, KaitenConfig } from '../kaiten';
import { TOKENS } from '../di/tokens';
import type { AccessGuard } from './guard';
import { type MinimalCard, toMinimalCard } from './projections';
import { collectCardPages } from './card-paging';

export interface CreateCardInput {
  title: string;
  description?: string;
  boardId: number;
  /**
   * Optional (3.4.0, specs/001-agent-guardrails US7): falls back to
   * `config.defaultColumnId` (`KAITEN_DEFAULT_COLUMN_ID`) when omitted; an
   * error naming both remedies is thrown when neither is available.
   */
  columnId?: number;
  laneId?: number | null;
  tags?: (string | { name: string })[];
  size?: number;
  plannedStart?: string;
  plannedEnd?: string;
  parentId?: number | null;
  typeId?: number;
}

@injectable()
export class CardService {
  constructor(
    @inject(TOKENS.KaitenApi) private readonly api: KaitenApiPort,
    @inject(TOKENS.AccessGuard) private readonly guard: AccessGuard,
    @inject(TOKENS.Config)
    private readonly config: Pick<
      KaitenConfig,
      | 'defaultSpaceId'
      | 'defaultBoardId'
      | 'allowedBoardIds'
      | 'allowedColumnIds'
      | 'allowedLaneIds'
      | 'defaultColumnId'
      | 'defaultLaneId'
    >
  ) {}

  /**
   * Board argument falls back to `config.defaultBoardId` when omitted
   * (FR-002). The board id actually used (explicit or default) is validated
   * the same way `spaceId` already is - out-of-scope explicit addressing
   * throws (mirrors the pre-existing space behavior); results are then
   * silently narrowed to the board/column/lane allowlists (FR-001, FR-004) -
   * a defense-in-depth filter that also covers the space-wide, no-board-arg
   * case where multiple boards can appear in one response.
   *
   * Since 4.1.0 the defaults are `condition: 1` (on-board cards only; pass
   * `2` for archived, `'all'` for both) and `updated` `desc` ordering - the
   * server's own defaults (all conditions, oldest first) made large boards
   * return only ancient archived cards (kaiten-mcp-3mh). `limit` above the
   * server's per-request cap of 100 is fetched in sequential pages,
   * bounded by MAX_PAGES.
   */
  async getCards(
    spaceId: number | null = null,
    boardId: number | null = null,
    minimal = false,
    options: CardListOptions = {}
  ): Promise<Card[] | MinimalCard[]> {
    const id = spaceId || this.config.defaultSpaceId;
    this.guard.validateSpaceId(id);
    const effectiveBoardId = boardId || this.config.defaultBoardId;
    if (effectiveBoardId) this.guard.validateBoardId(effectiveBoardId);
    const cards = await collectCardPages(options, (pageOptions) =>
      this.api.cards.getCards(id as number, effectiveBoardId ?? null, pageOptions)
    );
    const scoped = this.filterScope(cards);
    if (!minimal) return scoped;
    return scoped.map(toMinimalCard);
  }

  /** Silent read-narrowing (FR-001, FR-004) - never throws, just drops out-of-scope cards. */
  private filterScope(cards: Card[]): Card[] {
    let result = cards;
    const { allowedBoardIds, allowedColumnIds, allowedLaneIds } = this.config;
    if (allowedBoardIds) result = result.filter((c) => allowedBoardIds.includes(c.board_id));
    if (allowedColumnIds) result = result.filter((c) => allowedColumnIds.includes(c.column_id));
    if (allowedLaneIds) result = result.filter((c) => c.lane_id != null && allowedLaneIds.includes(c.lane_id));
    return result;
  }

  async getCard(cardId: number, minimal = false): Promise<Card | MinimalCard> {
    await this.guard.validateCardId(cardId);
    const card = await this.api.cards.getCard(cardId);
    if (minimal) return toMinimalCard(card);
    return card;
  }

  /**
   * `columnId`/`laneId` fall back to `config.defaultColumnId`/`defaultLaneId`
   * (`KAITEN_DEFAULT_COLUMN_ID`/`KAITEN_DEFAULT_LANE_ID`) when omitted (US7,
   * specs/001-agent-guardrails FR-011); explicit arguments always win. The
   * *resolved* target still goes through `validateColumnTarget`/
   * `validateLaneTarget` - a configured default never bypasses the column/lane
   * guardrails (US2).
   */
  async createCard(input: CreateCardInput): Promise<Card> {
    const { title, description, boardId, columnId, laneId, tags, size, plannedStart, plannedEnd, parentId = null, typeId } = input;
    const resolvedColumnId = columnId ?? this.config.defaultColumnId ?? undefined;
    if (resolvedColumnId == null) {
      throw new Error(
        'Column ID is required to create a card: pass columnId explicitly, or set KAITEN_DEFAULT_COLUMN_ID.'
      );
    }
    const resolvedLaneId = laneId ?? this.config.defaultLaneId ?? undefined;
    this.guard.validateBoardId(boardId);
    this.guard.validateColumnTarget(resolvedColumnId);
    this.guard.validateLaneTarget(resolvedLaneId);
    const data: Record<string, unknown> = {
      title,
      board_id: boardId,
      column_id: resolvedColumnId,
    };

    if (description) data.description = description;
    if (resolvedLaneId) data.lane_id = resolvedLaneId;
    if (tags) data.tags = tags.map((t) => (typeof t === 'string' ? { name: t } : t));
    if (size) data.size = size;
    if (plannedStart) data.planned_start = plannedStart;
    if (plannedEnd) data.planned_end = plannedEnd;
    if (parentId) data.parent_id = parentId;
    if (typeId) data.type_id = typeId;

    return this.api.cards.createCard(data);
  }

  /**
   * `data` is the already-merged patch (structured fields overlaid on the
   * legacy `data` JSON, resolved by the MCP tool handler) - inspecting its
   * `column_id`/`lane_id`/`board_id` keys here is the single enforcement
   * point that covers both the structured fields and the legacy path
   * (research.md R5).
   */
  async updateCard(cardId: number, data: Record<string, unknown>): Promise<Card> {
    await this.guard.validateCardId(cardId);
    if (typeof data.column_id === 'number') this.guard.validateColumnTarget(data.column_id);
    if (typeof data.lane_id === 'number') this.guard.validateLaneTarget(data.lane_id);
    if (typeof data.board_id === 'number') this.guard.validateBoardId(data.board_id);
    return this.api.cards.updateCard(cardId, data);
  }

  async deleteCard(cardId: number): Promise<unknown> {
    await this.guard.validateCardId(cardId);
    return this.api.cards.deleteCard(cardId);
  }

  async moveToColumn(
    cardId: number,
    columnId: number,
    laneId: number | null = null
  ): Promise<{ success: true; cardId: number; columnId: number; laneId: number | null }> {
    await this.guard.validateCardId(cardId);
    this.guard.validateColumnTarget(columnId);
    this.guard.validateLaneTarget(laneId);
    await this.api.cards.moveCard(cardId, columnId, laneId);
    return { success: true, cardId, columnId, laneId };
  }

  async assignTo(cardId: number, userId: number): Promise<{ success: true; cardId: number; userId: number }> {
    await this.guard.validateCardId(cardId);
    await this.api.cards.assignCard(cardId, userId);
    return { success: true, cardId, userId };
  }

  async unassignFrom(cardId: number, userId: number): Promise<Card> {
    await this.guard.validateCardId(cardId);
    return this.api.cards.unassignCard(cardId, userId);
  }

  async archive(cardId: number): Promise<Card> {
    await this.guard.validateCardId(cardId);
    return this.api.cards.archiveCard(cardId);
  }

  async unarchive(cardId: number): Promise<Card> {
    await this.guard.validateCardId(cardId);
    return this.api.cards.unarchiveCard(cardId);
  }
}
