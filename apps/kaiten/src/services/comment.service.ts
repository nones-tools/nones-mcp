import { inject, injectable } from 'inversify';
import type { Comment, KaitenApiPort } from '../kaiten';
import { TOKENS } from '../di/tokens';
import type { AccessGuard } from './guard';

@injectable()
export class CommentService {
  constructor(
    @inject(TOKENS.KaitenApi) private readonly api: KaitenApiPort,
    @inject(TOKENS.AccessGuard) private readonly guard: AccessGuard
  ) {}

  async addComment(cardId: number, text: string, parentId: number | null = null): Promise<Comment> {
    await this.guard.validateCardId(cardId);
    return this.api.comments.createComment(cardId, text, parentId);
  }

  async getComments(cardId: number): Promise<Comment[]> {
    await this.guard.validateCardId(cardId);
    return this.api.comments.getComments(cardId);
  }

  updateComment(commentId: number, text: string): Promise<Comment> {
    return this.api.comments.updateComment(commentId, text);
  }

  deleteComment(commentId: number): Promise<void> {
    return this.api.comments.deleteComment(commentId);
  }
}
