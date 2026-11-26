import { inject, injectable } from 'inversify';
import type { ExternalLink, KaitenApiPort } from '../kaiten';
import { TOKENS } from '../di/tokens';
import type { AccessGuard } from './guard';

@injectable()
export class LinkService {
  constructor(
    @inject(TOKENS.KaitenApi) private readonly api: KaitenApiPort,
    @inject(TOKENS.AccessGuard) private readonly guard: AccessGuard
  ) {}

  async getExternalLinks(cardId: number): Promise<ExternalLink[]> {
    await this.guard.validateCardId(cardId);
    return this.api.links.getExternalLinks(cardId);
  }

  async addExternalLink(cardId: number, url: string, description?: string): Promise<ExternalLink> {
    await this.guard.validateCardId(cardId);
    return this.api.links.addExternalLink(cardId, url, description);
  }

  async removeExternalLink(cardId: number, linkId: number): Promise<unknown> {
    await this.guard.validateCardId(cardId);
    return this.api.links.removeExternalLink(cardId, linkId);
  }
}
