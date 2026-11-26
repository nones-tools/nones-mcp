import { inject, injectable } from 'inversify';
import type { CardType, CustomProperty, KaitenApiPort, Tag } from '../kaiten';
import { TOKENS } from '../di/tokens';

/**
 * Company-wide read-only dictionaries (tags, card types, custom property
 * definitions). No `AccessGuard` involved - these aren't scoped to a
 * space/board/card, so the allowlists don't apply.
 */
@injectable()
export class DictionaryService {
  constructor(@inject(TOKENS.KaitenApi) private readonly api: KaitenApiPort) {}

  getTags(query?: string, spaceId?: number): Promise<Tag[]> {
    return this.api.company.getTags(query, spaceId);
  }

  getCardTypes(): Promise<CardType[]> {
    return this.api.company.getCardTypes();
  }

  getCustomProperties(): Promise<CustomProperty[]> {
    return this.api.company.getCustomProperties();
  }
}
