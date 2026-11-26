import type { CardType, CustomProperty, HttpTransport, Tag } from '../interfaces';

/** Company-wide read-only dictionaries: tags, card types, custom property definitions. */
export class CompanyApi {
  constructor(private readonly client: HttpTransport) {}

  getTags(query?: string, spaceId?: number): Promise<Tag[]> {
    return this.client.get<Tag[]>('/tags', { query, space_id: spaceId });
  }

  getCardTypes(): Promise<CardType[]> {
    return this.client.get<CardType[]>('/card-types');
  }

  getCustomProperties(): Promise<CustomProperty[]> {
    return this.client.get<CustomProperty[]>('/company/custom-properties');
  }
}
