import { inject, injectable } from 'inversify';
import type { Card, KaitenApiPort } from '../kaiten';
import { TOKENS } from '../di/tokens';
import type { CardService } from './card.service';
import type { AccessGuard } from './guard';
import { type MinimalParent, type MinimalSubtask, toMinimalParent, toMinimalSubtask } from './projections';

export interface TaskFlowTask {
  title: string;
  description?: string;
  tags?: (string | { name: string })[];
  [key: string]: unknown;
}

@injectable()
export class HierarchyService {
  constructor(
    @inject(TOKENS.KaitenApi) private readonly api: KaitenApiPort,
    @inject(TOKENS.AccessGuard) private readonly guard: AccessGuard,
    @inject(TOKENS.CardService) private readonly cards: CardService
  ) {}

  async createSubtask(parentId: number, title: string, position = 0): Promise<Card> {
    await this.guard.validateCardId(parentId);
    return this.api.subtasks.createSubtask(parentId, title, position);
  }

  async getSubtasks(cardId: number, minimal = false): Promise<Card[] | MinimalSubtask[]> {
    await this.guard.validateCardId(cardId);
    const subtasks = await this.api.subtasks.getSubtasks(cardId);
    if (minimal) return subtasks.map(toMinimalSubtask);
    return subtasks;
  }

  async getAllSubtasks(cardId: number, minimal = false): Promise<Card[] | MinimalSubtask[]> {
    await this.guard.validateCardId(cardId);
    const subtasks = await this.api.subtasks.getAllSubtasks(cardId);
    if (minimal) return subtasks.map(toMinimalSubtask);
    return subtasks;
  }

  async getParent(cardId: number, minimal = false): Promise<Card | MinimalParent | null> {
    await this.guard.validateCardId(cardId);
    const parent = await this.api.subtasks.getParent(cardId);
    if (minimal && parent) return toMinimalParent(parent);
    return parent;
  }

  async attachToParent(cardId: number, parentId: number, position = 0): Promise<unknown> {
    await this.guard.validateCardId(cardId);
    await this.guard.validateCardId(parentId);
    return this.api.subtasks.attachToParent(cardId, parentId, position);
  }

  async detachFromParent(cardId: number): Promise<unknown> {
    await this.guard.validateCardId(cardId);
    return this.api.subtasks.detachFromParent(cardId);
  }

  async createTaskFlow(parentCard: number, tasks: TaskFlowTask[]): Promise<Record<string, unknown>[]> {
    const createdTasks: Record<string, unknown>[] = [];

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i]!;
      const subtask = await this.createSubtask(parentCard, task.title, i);

      if (task.description) {
        await this.cards.updateCard(subtask.id, { description: task.description });
      }

      if (task.tags) {
        await this.cards.updateCard(subtask.id, {
          tags: task.tags.map((t) => (typeof t === 'string' ? { name: t } : t)),
        });
      }

      createdTasks.push({ ...subtask, ...task });
    }

    return createdTasks;
  }
}
