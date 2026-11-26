import { inject, injectable } from 'inversify';
import type { KaitenApiPort, TimeLog } from '../kaiten';
import { TOKENS } from '../di/tokens';
import type { AccessGuard } from './guard';

@injectable()
export class TimeLogService {
  constructor(
    @inject(TOKENS.KaitenApi) private readonly api: KaitenApiPort,
    @inject(TOKENS.AccessGuard) private readonly guard: AccessGuard
  ) {}

  async getTimeLogs(cardId: number): Promise<TimeLog[]> {
    await this.guard.validateCardId(cardId);
    return this.api.timeLogs.getTimeLogs(cardId);
  }

  async addTimeLog(cardId: number, timeSpent: number, forDate: string, roleId: number, comment?: string): Promise<TimeLog> {
    await this.guard.validateCardId(cardId);
    return this.api.timeLogs.addTimeLog(cardId, timeSpent, forDate, roleId, comment);
  }
}
