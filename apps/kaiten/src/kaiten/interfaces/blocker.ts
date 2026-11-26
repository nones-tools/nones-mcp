/**
 * Kaiten card blocker entity type. See card.ts for the modeling rationale.
 */

export interface CardBlocker {
  id: number;
  reason?: string;
  blocker_card_id?: number;
  [key: string]: unknown;
}
