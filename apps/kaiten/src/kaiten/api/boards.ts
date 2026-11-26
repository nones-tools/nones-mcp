import type { Board, Column, HttpTransport, Lane, Space } from '../interfaces';

export class BoardsApi {
  constructor(private readonly client: HttpTransport) {}

  getSpaces(): Promise<Space[]> {
    return this.client.get<Space[]>('/spaces');
  }

  getLanes(boardId: number): Promise<Lane[]> {
    return this.client.get<Lane[]>(`/boards/${boardId}/lanes`);
  }

  getSpace(spaceId: number): Promise<Space> {
    return this.client.get<Space>(`/spaces/${spaceId}`);
  }

  getColumns(boardId: number): Promise<Column[]> {
    return this.client.get<Column[]>(`/boards/${boardId}/columns`);
  }

  getColumn(columnId: number): Promise<Column> {
    return this.client.get<Column>(`/columns/${columnId}`);
  }

  getBoard(boardId: number): Promise<Board> {
    return this.client.get<Board>(`/boards/${boardId}`);
  }

  getBoards(spaceId: number): Promise<Board[]> {
    return this.client.get<Board[]>(`/spaces/${spaceId}/boards`);
  }
}
