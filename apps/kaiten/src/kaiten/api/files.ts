import type { CardFile, HttpTransport } from '../interfaces';

export class FilesApi {
  constructor(private readonly client: HttpTransport) {}

  getCardFiles(cardId: number): Promise<CardFile[]> {
    return this.client.get<CardFile[]>(`/cards/${cardId}/files`);
  }

  downloadFile(cardId: number, fileId: number): Promise<Buffer> {
    return this.client.getBuffer(`/cards/${cardId}/files/${fileId}`);
  }

  /** Multipart upload - the `file` part name is fixed by the Kaiten API. */
  attachFile(cardId: number, form: FormData): Promise<CardFile> {
    return this.client.putForm<CardFile>(`/cards/${cardId}/files`, form);
  }
}
