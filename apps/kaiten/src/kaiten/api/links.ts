import type { ExternalLink, HttpTransport } from '../interfaces';

export class LinksApi {
  constructor(private readonly client: HttpTransport) {}

  getExternalLinks(cardId: number): Promise<ExternalLink[]> {
    return this.client.get<ExternalLink[]>(`/cards/${cardId}/external-links`);
  }

  addExternalLink(cardId: number, url: string, description?: string): Promise<ExternalLink> {
    const body: Record<string, unknown> = { url };
    if (description !== undefined) body.description = description;
    return this.client.post<ExternalLink>(`/cards/${cardId}/external-links`, body);
  }

  /** Goes through `HttpTransport.delete()` - gated by `KAITEN_API_DELETE_ALLOW`. */
  removeExternalLink(cardId: number, linkId: number): Promise<unknown> {
    return this.client.delete(`/cards/${cardId}/external-links/${linkId}`);
  }
}
