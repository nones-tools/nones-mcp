import type { Card } from '../kaiten';

export interface MinimalCard {
  id: number;
  title: string;
  description?: string | null;
  board_id: number;
  column_id: number;
  lane_id?: number | null;
  condition?: number;
  tags?: Card['tags'];
  parents_count?: number;
  children_count?: number;
}

export interface TaggedCard {
  id: number;
  title: string;
  description?: string | null;
  board_id: number;
  column_id: number;
  condition?: number;
  tags?: Card['tags'];
}

export interface MinimalSubtask {
  id: number;
  title: string;
  board_id: number;
  column_id: number;
  condition?: number;
  parents_count?: number;
  children_count?: number;
}

export interface MinimalParent {
  id: number;
  title: string;
  board_id: number;
  column_id: number;
  condition?: number;
}

export function toMinimalCard(card: Card): MinimalCard {
  return {
    id: card.id,
    title: card.title,
    description: card.description,
    board_id: card.board_id,
    column_id: card.column_id,
    lane_id: card.lane_id,
    condition: card.condition,
    tags: card.tags,
    parents_count: card.parents_count,
    children_count: card.children_count,
  };
}

export function toTaggedCard(card: Card): TaggedCard {
  return {
    id: card.id,
    title: card.title,
    description: card.description,
    board_id: card.board_id,
    column_id: card.column_id,
    condition: card.condition,
    tags: card.tags,
  };
}

export function toMinimalSubtask(card: Card): MinimalSubtask {
  return {
    id: card.id,
    title: card.title,
    board_id: card.board_id,
    column_id: card.column_id,
    condition: card.condition,
    parents_count: card.parents_count,
    children_count: card.children_count,
  };
}

export function toMinimalParent(card: Card): MinimalParent {
  return {
    id: card.id,
    title: card.title,
    board_id: card.board_id,
    column_id: card.column_id,
    condition: card.condition,
  };
}
