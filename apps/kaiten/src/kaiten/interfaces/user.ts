/**
 * Kaiten user entity type. See card.ts for the modeling rationale.
 */

export interface User {
  id: number;
  full_name?: string;
  email?: string;
  [key: string]: unknown;
}
