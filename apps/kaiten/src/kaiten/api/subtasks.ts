import type { Card, HttpTransport } from '../interfaces';

export class SubtasksApi {
  constructor(private readonly client: HttpTransport) {}

  getSubtasks(cardId: number): Promise<Card[]> {
    return this.client.get<Card[]>(`/cards/${cardId}/children`);
  }

  getAllSubtasks(cardId: number): Promise<Card[]> {
    return this.client.get<Card[]>(`/cards/${cardId}/children?all=true`);
  }

  /** Prefers parent_link_ids[0] (fetched in full), falls back to parents[0], else null. */
  async getParent(cardId: number): Promise<Card | null> {
    const card = await this.client.get<Card>(`/cards/${cardId}`);
    if (card.parent_link_ids && card.parent_link_ids.length > 0) {
      return this.client.get<Card>(`/cards/${card.parent_link_ids[0]}`);
    }
    if (card.parents && card.parents.length > 0) {
      return card.parents[0]!;
    }
    return null;
  }

  async createSubtask(cardId: number, title: string, position = 0): Promise<Card> {
    const parentCard = await this.client.get<Card>(`/cards/${cardId}`);
    const newCard = await this.client.post<Card>('/cards', {
      title,
      board_id: parentCard.board_id,
      column_id: parentCard.column_id,
      position,
    });
    await this.attachToParent(newCard.id, cardId, position);
    return newCard;
  }

  updateSubtask(subtaskId: number, data: Record<string, unknown>): Promise<Card> {
    return this.client.patch<Card>(`/cards/${subtaskId}`, data);
  }

  async deleteSubtask(subtaskId: number): Promise<void> {
    await this.client.delete(`/cards/${subtaskId}`);
  }

  toggleSubtaskComplete(subtaskId: number, isComplete = true): Promise<Card> {
    return this.client.patch<Card>(`/cards/${subtaskId}`, { condition: isComplete ? 3 : 1 });
  }

  attachToParent(cardId: number, parentId: number, _position = 0): Promise<unknown> {
    return this.client.post(`/cards/${parentId}/children`, { card_id: cardId });
  }

  async detachFromParent(cardId: number): Promise<unknown> {
    const parent = await this.getParent(cardId);
    if (!parent) {
      throw new Error('Card has no parent');
    }
    return this.client.delete(`/cards/${parent.id}/children/${cardId}`);
  }
}
