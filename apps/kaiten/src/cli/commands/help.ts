import type { CliCommand } from '../../interfaces';
import { HELP_TEXT } from '../help';

export const helpCommand: CliCommand = {
  name: 'help',
  aliases: ['--help', '-h'],
  async run() {
    console.log(HELP_TEXT);
  },
};
