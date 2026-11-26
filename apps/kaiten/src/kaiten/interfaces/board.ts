/**
 * Kaiten board/space entity types. See card.ts for the modeling rationale.
 */

export interface Space {
  id: number;
  title: string;
  [key: string]: unknown;
}

export interface Board {
  id: number;
  title: string;
  [key: string]: unknown;
}

export interface Column {
  id: number;
  title: string;
  [key: string]: unknown;
}

export interface Lane {
  id: number;
  title: string;
  board_id: number;
  condition?: number;
  sort_order?: number;
  [key: string]: unknown;
}
