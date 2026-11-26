/**
 * Company-wide dictionary entity types (card types, custom property
 * definitions). See card.ts for the modeling rationale.
 */

export interface CardType {
  id: number;
  name?: string;
  [key: string]: unknown;
}

export interface CustomProperty {
  id: number;
  name?: string;
  [key: string]: unknown;
}
