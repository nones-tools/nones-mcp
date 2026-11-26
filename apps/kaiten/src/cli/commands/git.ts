import type { CliCommand } from '../../interfaces';
import type { Card } from '../../kaiten';

export const gitBranchCommand: CliCommand = {
  name: 'git-branch',
  async run(argv, { getSdk }) {
    const gitCardId = argv[1];
    if (!gitCardId) {
      console.error('Error: Card ID required');
      process.exit(1);
    }
    const sdk = getSdk();
    const card = (await sdk.getCard(Number(gitCardId))) as Card;
    const branchName = await sdk.createGitBranch(Number(gitCardId), card.title);
    console.log(`Created branch: ${branchName}`);
    console.log(`Card: ${card.title} (${gitCardId})`);
  },
};

export const gitCheckoutCommand: CliCommand = {
  name: 'git-checkout',
  async run(argv, { getSdk }) {
    const checkoutCardId = argv[1];
    if (!checkoutCardId) {
      console.error('Error: Card ID required');
      process.exit(1);
    }
    const sdk = getSdk();
    const checkoutCard = (await sdk.getCard(Number(checkoutCardId))) as Card;
    const branchName = await sdk.checkoutGitBranch(Number(checkoutCardId), checkoutCard.title);
    console.log(`Checked out to: ${branchName}`);
    console.log(`Card: ${checkoutCard.title} (${checkoutCardId})`);
  },
};

export const gitCommitCommand: CliCommand = {
  name: 'git-commit',
  async run(argv, { getSdk }) {
    const commitCardId = argv[1];
    const commitMessage = argv[2] || 'Work in progress';
    if (!commitCardId) {
      console.error('Error: Card ID required');
      process.exit(1);
    }
    const sdk = getSdk();
    await sdk.gitAddAll();
    await sdk.commitGit(Number(commitCardId), commitMessage);
    console.log(`[${commitCardId}] ${commitMessage}`);
  },
};

export const gitStatusCommand: CliCommand = {
  name: 'git-status',
  async run(_argv, { getSdk }) {
    const status = await getSdk().getGitStatus();
    console.log(status);
  },
};

export const gitPushCommand: CliCommand = {
  name: 'git-push',
  async run(argv, { getSdk }) {
    const pushCardId = argv[1];
    if (!pushCardId) {
      console.error('Error: Card ID required');
      process.exit(1);
    }
    const sdk = getSdk();
    const pushCard = (await sdk.getCard(Number(pushCardId))) as Card;
    // sdk.gitPush() returns void (it creates+checks out the branch internally
    // then pushes it); read back the now-current branch to report it, since
    // the old CLI printed the branch name gitPush used to resolve.
    await sdk.gitPush(Number(pushCardId), pushCard.title);
    const currentBranch = await sdk.getCurrentBranch();
    console.log(`Pushed branch: ${currentBranch}`);
  },
};
