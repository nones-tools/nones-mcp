/**
 * Kaiten comment entity type. See card.ts for the modeling rationale.
 */

export interface Comment {
  id: number;
  text?: string;
  card_id?: number;
  parent_id?: number | null;
  [key: string]: unknown;
}
