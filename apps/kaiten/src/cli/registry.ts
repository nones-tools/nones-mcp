import type { CliCommand } from '../interfaces';
import { assignCommand, boardCommand, cardCommand, cardsCommand, cardSimpleCommand, columnCommand, commentCommand, createCommand, deleteCommand, findCommand, gitBranchCommand, gitCheckoutCommand, gitCommitCommand, gitPushCommand, gitStatusCommand, helpCommand, initCommand, mcpCommand, moveCommand, simpleCommand, subtaskCommand, tagCommand, updateCommand, userCommand } from './commands';

/** Every CLI command, in help-text order. Adding a command = one entry here + its module. */
export const commands: CliCommand[] = [
  cardsCommand,
  cardCommand,
  simpleCommand,
  cardSimpleCommand,
  createCommand,
  updateCommand,
  deleteCommand,
  moveCommand,
  assignCommand,
  subtaskCommand,
  commentCommand,
  boardCommand,
  columnCommand,
  userCommand,
  tagCommand,
  findCommand,
  gitBranchCommand,
  gitCheckoutCommand,
  gitCommitCommand,
  gitPushCommand,
  gitStatusCommand,
  initCommand,
  mcpCommand,
  helpCommand,
];

/** Maps every command name and alias to its command. Later registrations do not silently override earlier ones. */
export function buildRegistry(list: CliCommand[] = commands): Map<string, CliCommand> {
  const registry = new Map<string, CliCommand>();
  for (const command of list) {
    for (const key of [command.name, ...(command.aliases ?? [])]) {
      if (registry.has(key)) {
        throw new Error(`Duplicate CLI command name or alias: ${key}`);
      }
      registry.set(key, command);
    }
  }
  return registry;
}
