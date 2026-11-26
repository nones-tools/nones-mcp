import type { CliCommand } from '../../interfaces';

export const boardCommand: CliCommand = {
  name: 'board',
  async run(argv, { getSdk }) {
    const spaceId = argv[1] ? Number(argv[1]) : null;
    const boards = await getSdk().getBoards(spaceId);
    console.log(JSON.stringify(boards, null, 2));
  },
};

export const columnCommand: CliCommand = {
  name: 'column',
  async run(argv, { getSdk }) {
    const boardId = argv[1];
    const columns = await getSdk().getColumns(Number(boardId));
    console.log(JSON.stringify(columns, null, 2));
  },
};

export const userCommand: CliCommand = {
  name: 'user',
  async run(argv, { getSdk }) {
    const userQuery = argv[1];
    if (userQuery) {
      const user = await getSdk().findUser(userQuery);
      console.log(JSON.stringify(user, null, 2));
    } else {
      const users = await getSdk().getUsers();
      console.log(JSON.stringify(users, null, 2));
    }
  },
};
