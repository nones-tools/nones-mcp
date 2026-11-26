import { inject, injectable } from 'inversify';
import type { CardBlocker, KaitenApiPort } from '../kaiten';
import { TOKENS } from '../di/tokens';
import type { AccessGuard } from './guard';

@injectable()
export class BlockerService {
  constructor(
    @inject(TOKENS.KaitenApi) private readonly api: KaitenApiPort,
    @inject(TOKENS.AccessGuard) private readonly guard: AccessGuard
  ) {}

  async getBlockers(cardId: number): Promise<CardBlocker[]> {
    await this.guard.validateCardId(cardId);
    return this.api.blockers.getBlockers(cardId);
  }

  async blockCard(cardId: number, reason?: string, blockerCardId?: number): Promise<CardBlocker> {
    await this.guard.validateCardId(cardId);
    return this.api.blockers.blockCard(cardId, reason, blockerCardId);
  }

  async unblockCard(cardId: number, blockerId: number): Promise<unknown> {
    await this.guard.validateCardId(cardId);
    return this.api.blockers.unblockCard(cardId, blockerId);
  }
}
