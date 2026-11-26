import type { CliCommand } from '../../interfaces';

export const commentCommand: CliCommand = {
  name: 'comment',
  async run(argv, { getSdk }) {
    const commentCmd = argv[1];
    if (commentCmd === 'add') {
      const commentCardId = argv[2];
      const commentText = argv[3];
      const comment = await getSdk().addComment(Number(commentCardId), commentText as string);
      console.log(JSON.stringify(comment, null, 2));
    } else if (commentCmd === 'list') {
      const commentCardId = argv[2];
      const comments = await getSdk().getComments(Number(commentCardId));
      console.log(JSON.stringify(comments, null, 2));
    }
  },
};
