/**
 * Kaiten card external-link entity type. See card.ts for the modeling
 * rationale.
 */

export interface ExternalLink {
  id: number;
  url: string;
  description?: string | null;
  [key: string]: unknown;
}
