import type { Card, Checklist, ChecklistItem, Column, HttpTransport, Tag } from '../interfaces';

/**
 * Query options for the card-list endpoint, mapped 1:1 onto the documented
 * `GET /cards` query params (developers.kaiten.ru/cards/retrieve-card-list).
 * No defaults here - the API layer is a thin mapper; defaults live in
 * `CardService.getCards`.
 */
export interface CardListOptions {
  /** 1 = on board, 2 = archived, 'all' = no condition filter (server returns both). */
  condition?: 1 | 2 | 'all';
  /** Per-request page size; the server caps it at 100. */
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

export class CardsApi {
  constructor(private readonly client: HttpTransport) {}

  /**
   * `GET /cards?space_id=...` is the documented card-list endpoint
   * (developers.kaiten.ru/cards/retrieve-card-list). The previously used
   * `/spaces/{id}/cards` path is not in the API docs, and some Kaiten
   * installations serve it as the unfiltered company-wide `/cards` list,
   * silently ignoring the space (kaiten-mcp-zl8).
   */
  getCards(spaceId: number, boardId?: number | null, options: CardListOptions = {}): Promise<Card[]> {
    const { condition, limit, offset, orderBy, orderDirection } = options;
    return this.client.get<Card[]>('/cards', {
      space_id: spaceId,
      board_id: boardId ?? undefined,
      condition: condition === 'all' ? undefined : condition,
      limit,
      offset,
      order_by: orderBy,
      order_direction: orderDirection,
    });
  }

  getCard(cardId: number): Promise<Card> {
    return this.client.get<Card>(`/cards/${cardId}`);
  }

  createChecklist(cardId: number, name: string): Promise<Checklist> {
    return this.client.post<Checklist>(`/cards/${cardId}/checklists`, { name });
  }

  deleteChecklist(cardId: number, checklistId: number): Promise<unknown> {
    return this.client.delete(`/cards/${cardId}/checklists/${checklistId}`);
  }

  updateChecklist(cardId: number, checklistId: number, data: Record<string, unknown>): Promise<Checklist> {
    return this.client.patch<Checklist>(`/cards/${cardId}/checklists/${checklistId}`, data);
  }

  createCard(data: Record<string, unknown>): Promise<Card> {
    return this.client.post<Card>('/cards', data);
  }

  updateCard(cardId: number, data: Record<string, unknown>): Promise<Card> {
    return this.client.patch<Card>(`/cards/${cardId}`, data);
  }

  deleteCard(cardId: number): Promise<unknown> {
    return this.client.delete(`/cards/${cardId}`);
  }

  /**
   * Validates the target column belongs to the card's board before moving,
   * throwing a helpful error listing the board's available columns if not.
   */
  async moveCard(cardId: number, columnId: number, laneId: number | null = null): Promise<Card> {
    let card: Card;
    try {
      card = await this.getCard(cardId);
    } catch {
      throw new Error(`Card with ID ${cardId} not found`);
    }

    let columns: Column[];
    try {
      columns = await this.client.get<Column[]>(`/boards/${card.board_id}/columns`);
    } catch {
      throw new Error(`Failed to get columns for board ${card.board_id}`);
    }

    const targetColumn = columns.find((c) => c.id === columnId);
    if (!targetColumn) {
      throw new Error(
        `Column with ID ${columnId} not found on board ${card.board_id}. ` +
          `Available columns on this board: ${columns.map((c) => `${c.id} (${c.title})`).join(', ')}`
      );
    }

    const data: Record<string, unknown> = { column_id: columnId };
    if (laneId) data.lane_id = laneId;
    return this.client.patch<Card>(`/cards/${cardId}`, data);
  }

  assignCard(cardId: number, userId: number): Promise<Card> {
    return this.client.patch<Card>(`/cards/${cardId}`, { members: [{ id: userId }] });
  }

  unassignCard(cardId: number, userId: number): Promise<Card> {
    return this.client.patch<Card>(`/cards/${cardId}`, { members_remove: [userId] });
  }

  archiveCard(cardId: number): Promise<Card> {
    return this.client.patch<Card>(`/cards/${cardId}`, { condition: 2 });
  }

  unarchiveCard(cardId: number): Promise<Card> {
    return this.client.patch<Card>(`/cards/${cardId}`, { condition: 1 });
  }

  addTag(cardId: number, tagName: string): Promise<Tag> {
    return this.client.post<Tag>(`/cards/${cardId}/tags`, { name: tagName });
  }

  /** Resolves the tag id from the card's own tags before deleting. */
  async removeTag(cardId: number, tagName: string): Promise<unknown> {
    const card = await this.getCard(cardId);
    const tag = card.tags?.find((t) => t.name === tagName);
    if (!tag) {
      throw new Error(`Tag "${tagName}" not found on card`);
    }
    return this.client.delete(`/cards/${cardId}/tags/${tag.id}`);
  }

  setTags(cardId: number, tagNames: string[]): Promise<Card> {
    const tags = tagNames.map((name) => ({ name }));
    return this.client.patch<Card>(`/cards/${cardId}`, { tags });
  }

  toggleChecklistItem(checklistId: number, itemId: number, checked: boolean): Promise<ChecklistItem> {
    return this.client.patch<ChecklistItem>(`/checklists/${checklistId}/items/${itemId}`, { checked });
  }

  addChecklistItem(checklistId: number, text: string): Promise<ChecklistItem> {
    return this.client.post<ChecklistItem>(`/checklists/${checklistId}/items`, { text });
  }

  deleteChecklistItem(checklistId: number, itemId: number): Promise<unknown> {
    return this.client.delete(`/checklists/${checklistId}/items/${itemId}`);
  }
}
