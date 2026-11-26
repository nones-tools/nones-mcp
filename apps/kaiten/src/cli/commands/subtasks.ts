import type { CliCommand } from '../../interfaces';

export const subtaskCommand: CliCommand = {
  name: 'subtask',
  async run(argv, { getSdk }) {
    const subTaskCmd = argv[1];
    if (subTaskCmd === 'create') {
      const parentCardId = argv[2];
      const subtaskTitle = argv[3];
      const subtask = await getSdk().createSubtask(Number(parentCardId), subtaskTitle as string);
      console.log(JSON.stringify(subtask, null, 2));
    } else if (subTaskCmd === 'list') {
      const parentCardId = argv[2];
      const subtasks = await getSdk().getSubtasks(Number(parentCardId));
      console.log(JSON.stringify(subtasks, null, 2));
    }
  },
};
