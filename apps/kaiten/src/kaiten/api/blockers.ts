import type { CardBlocker, HttpTransport } from '../interfaces';

export class BlockersApi {
  constructor(private readonly client: HttpTransport) {}

  getBlockers(cardId: number): Promise<CardBlocker[]> {
    return this.client.get<CardBlocker[]>(`/cards/${cardId}/blockers`);
  }

  blockCard(cardId: number, reason?: string, blockerCardId?: number): Promise<CardBlocker> {
    const body: Record<string, unknown> = {};
    if (reason !== undefined) body.reason = reason;
    if (blockerCardId !== undefined) body.blocker_card_id = blockerCardId;
    return this.client.post<CardBlocker>(`/cards/${cardId}/blockers`, body);
  }

  /** Goes through `HttpTransport.delete()` - gated by `KAITEN_API_DELETE_ALLOW`. */
  unblockCard(cardId: number, blockerId: number): Promise<unknown> {
    return this.client.delete(`/cards/${cardId}/blockers/${blockerId}`);
  }
}
