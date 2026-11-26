/**
 * Kaiten card time-log entity type. See card.ts for the modeling rationale.
 */

export interface TimeLog {
  id: number;
  time_spent?: number;
  for_date?: string;
  role_id?: number;
  comment?: string;
  [key: string]: unknown;
}
