import { inject, injectable } from 'inversify';
import type { Card, KaitenApiPort } from '../kaiten';
import { TOKENS } from '../di/tokens';
import type { CardService } from './card.service';
import type { AccessGuard } from './guard';
import { type TaggedCard, toTaggedCard } from './projections';

@injectable()
export class TagService {
  constructor(
    @inject(TOKENS.KaitenApi) private readonly api: KaitenApiPort,
    @inject(TOKENS.AccessGuard) private readonly guard: AccessGuard,
    @inject(TOKENS.CardService) private readonly cards: CardService
  ) {}

  async addTag(cardId: number, tagName: string): Promise<TaggedCard> {
    await this.guard.validateCardId(cardId);
    await this.api.cards.addTag(cardId, tagName);
    const card = await this.api.cards.getCard(cardId);
    return toTaggedCard(card);
  }

  async removeTag(cardId: number, tagName: string): Promise<TaggedCard> {
    await this.guard.validateCardId(cardId);
    await this.api.cards.removeTag(cardId, tagName);
    const card = await this.api.cards.getCard(cardId);
    return toTaggedCard(card);
  }

  async setTags(cardId: number, tagNames: string[]): Promise<Card> {
    await this.guard.validateCardId(cardId);
    return this.api.cards.setTags(cardId, tagNames);
  }

  hasTag(card: Card, tagName: string): boolean {
    return card.tags?.some((t) => t.name === tagName) ?? false;
  }

  getTags(card: Card): string[] {
    return card.tags?.map((t) => t.name) ?? [];
  }

  async getCardsWithTag(tagName: string, spaceId: number | null = null): Promise<Card[]> {
    const cards = (await this.cards.getCards(spaceId)) as Card[];
    return cards.filter((card) => this.hasTag(card, tagName));
  }

  async getCardsWithoutTag(tagName: string, spaceId: number | null = null): Promise<Card[]> {
    const cards = (await this.cards.getCards(spaceId)) as Card[];
    return cards.filter((card) => !this.hasTag(card, tagName));
  }
}
