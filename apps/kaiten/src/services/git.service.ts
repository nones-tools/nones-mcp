import { inject, injectable } from 'inversify';
import type { KaitenApiPort } from '../kaiten';
import * as gitApi from '../lib';
import { TOKENS } from '../di/tokens';

@injectable()
export class GitService {
  constructor(@inject(TOKENS.KaitenApi) private readonly api: KaitenApiPort) {}

  getCurrentBranch(): Promise<string> {
    return gitApi.getCurrentBranch();
  }

  async createGitBranch(cardId: number, title?: string): Promise<string> {
    const isRepo = await gitApi.isGitRepo();
    if (!isRepo) {
      throw new Error('Not a git repository');
    }
    const cardTitle = title || (await this.api.cards.getCard(cardId)).title;
    return gitApi.createBranch(cardId, cardTitle);
  }

  async checkoutGitBranch(cardId: number, title?: string): Promise<string> {
    const isRepo = await gitApi.isGitRepo();
    if (!isRepo) {
      throw new Error('Not a git repository');
    }
    const cardTitle = title || (await this.api.cards.getCard(cardId)).title;
    return gitApi.checkoutBranch(cardId, cardTitle);
  }

  commitGit(cardId: number, message: string): Promise<void> {
    return gitApi.commitChanges(cardId, message);
  }

  getGitChanges(): Promise<string> {
    return gitApi.getCurrentChanges();
  }

  getGitStatus(): Promise<string> {
    return gitApi.getCurrentChanges();
  }

  gitAddAll(): Promise<void> {
    return gitApi.addAllFiles();
  }

  async gitPush(cardId: number, title?: string): Promise<void> {
    const isRepo = await gitApi.isGitRepo();
    if (!isRepo) {
      throw new Error('Not a git repository');
    }
    const branchName = await this.createGitBranch(cardId, title);
    return gitApi.pushBranch(branchName);
  }

  createPullRequest(cardId: number, title: string): Promise<void> {
    return gitApi.createPR(cardId, title);
  }
}
