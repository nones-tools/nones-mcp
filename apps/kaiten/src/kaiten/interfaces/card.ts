/**
 * Kaiten card-related entity types.
 *
 * These model only the fields the SDK/API layer actually reads or writes.
 * Kaiten's API returns many more fields than are modeled here; the index
 * signature keeps those accessible without widening every property to
 * `unknown`.
 */

export interface Tag {
  id: number;
  name: string;
  [key: string]: unknown;
}

export interface ChecklistItem {
  id: number;
  text?: string;
  checked?: boolean;
  [key: string]: unknown;
}

export interface Checklist {
  id: number;
  name?: string;
  items?: ChecklistItem[];
  [key: string]: unknown;
}

export interface CardFile {
  id: number;
  name?: string;
  [key: string]: unknown;
}

export interface Card {
  id: number;
  title: string;
  description?: string | null;
  board_id: number;
  column_id: number;
  lane_id?: number | null;
  condition?: number;
  tags?: Tag[];
  parents_count?: number;
  children_count?: number;
  parent_link_ids?: number[];
  parents?: Card[];
  checklists?: Checklist[];
  [key: string]: unknown;
}
