import type { Card } from '../kaiten';

// Kaiten's API returns many more fields than `Card` models (see
// src/kaiten/interfaces/card.ts); these projections reach past the typed
// subset into the raw response shape.
type Raw = Record<string, any>;

export function optimizeCard(card: Card) {
  const c = card as Raw;
  return {
    id: card.id,
    title: card.title,
    status: card.condition === 1 ? 'Активна' : 'Архивная',
    board: c.board?.title || 'Неизвестно',
    column: c.column?.title || 'Неизвестно',
    owner: c.owner?.full_name || 'Не назначен',
    size: c.size || null,
    tags: card.tags?.map((t) => t.name) || [],
    planned_start: c.planned_start ? c.planned_start.split('T')[0] : null,
    planned_end: c.planned_end ? c.planned_end.split('T')[0] : null,
    time_spent: c.time_spent_sum ? `${Math.round((c.time_spent_sum / 60) * 10) / 10}h` : null,
  };
}

export function optimizeCardMinimal(card: Card) {
  const c = card as Raw;
  return {
    i: card.id,
    t: card.title,
    c: c.column?.title || '?',
    tg: card.tags?.map((t) => t.name) || [],
  };
}

export function optimizeCardMinimalList(cards: Card[]) {
  return cards.map(optimizeCardMinimal);
}

// Optimized detailed card data
export function optimizeCardDetails(card: Card) {
  const c = card as Raw;
  return {
    id: card.id,
    title: card.title,
    status: card.condition === 1 ? 'Активна' : 'Архивная',
    state: {
      board: c.board?.title || 'Неизвестно',
      column: c.column?.title || 'Неизвестно',
      lane: c.lane?.title || '',
    },
    owner: c.owner?.full_name || 'Не назначен',
    members: c.members?.map((m: Raw) => m.full_name) || [],
    size: c.size,
    tags: card.tags?.map((t) => ({ name: t.name, color: t.color })) || [],
    planning: {
      start: c.planned_start ? c.planned_start.split('T')[0] : null,
      end: c.planned_end ? c.planned_end.split('T')[0] : null,
    },
    time: {
      spent: c.time_spent_sum ? `${Math.round((c.time_spent_sum / 60) * 10) / 10}h` : null,
      blocked: c.time_blocked_sum || 0,
    },
    dependencies: {
      predecessors:
        c.plannedPredecessors?.map((p: Raw) => ({
          id: p.id,
          title: p.title,
          status: p.state === 3 ? 'Готово' : p.state === 2 ? 'В работе' : 'Ожидание',
        })) || [],
    },
    comments: c.comments_total || 0,
    description: card.description ? card.description.substring(0, 500) + (card.description.length > 500 ? '...' : '') : '',
  };
}
