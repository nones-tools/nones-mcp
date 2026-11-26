import type { Comment, HttpTransport } from '../interfaces';

export class CommentsApi {
  constructor(private readonly client: HttpTransport) {}

  getComments(cardId: number): Promise<Comment[]> {
    return this.client.get<Comment[]>(`/cards/${cardId}/comments`);
  }

  getComment(commentId: number): Promise<Comment> {
    return this.client.get<Comment>(`/comments/${commentId}`);
  }

  createComment(cardId: number, text: string, parentId: number | null = null): Promise<Comment> {
    return this.client.post<Comment>(`/cards/${cardId}/comments`, {
      card_id: cardId,
      text,
      parent_id: parentId,
    });
  }

  updateComment(commentId: number, text: string): Promise<Comment> {
    return this.client.patch<Comment>(`/comments/${commentId}`, { text });
  }

  async deleteComment(commentId: number): Promise<void> {
    await this.client.delete(`/comments/${commentId}`);
  }
}
