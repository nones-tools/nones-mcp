import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

function sanitizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9-]+/g, '-').substring(0, 50);
}

function branchName(cardId: number | string, title: string): string {
  return `feature/${cardId}-${sanitizeTitle(title)}`;
}

export async function getCurrentBranch(): Promise<string> {
  const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD');
  return stdout.trim();
}

export async function createBranch(cardId: number | string, title: string): Promise<string> {
  const branch = branchName(cardId, title);
  await execAsync(`git checkout -b ${branch}`);
  return branch;
}

export async function checkoutBranch(cardId: number | string, title: string): Promise<string> {
  const branch = branchName(cardId, title);
  await execAsync(`git checkout ${branch}`);
  return branch;
}

export async function commitChanges(cardId: number | string, message: string): Promise<void> {
  const commitMessage = `[${cardId}] ${message}`;
  await execAsync(`git commit -m "${commitMessage}"`);
}

export async function getCurrentChanges(): Promise<string> {
  const { stdout } = await execAsync('git status --short');
  return stdout.trim();
}

export async function getChangedFiles(): Promise<string[]> {
  const { stdout } = await execAsync('git diff --name-only');
  return stdout.trim().split('\n').filter((f) => f);
}

export async function getUntrackedFiles(): Promise<string[]> {
  const { stdout } = await execAsync('git ls-files --others --exclude-standard');
  return stdout.trim().split('\n').filter((f) => f);
}

export async function addAllFiles(): Promise<void> {
  await execAsync('git add .');
}

export async function pushBranch(branch: string): Promise<void> {
  await execAsync(`git push -u origin ${branch}`);
}

export async function createPR(cardId: number | string, title: string): Promise<void> {
  // Kept as a no-op stub matching the old CLI: real PR creation requires the
  // GitHub CLI or manual creation, this just reports what would be needed.
  console.error('PR creation requires GitHub CLI or manual creation');
  console.error(`Branch: feature/${cardId}-${title}`);
  console.error(`Card: ${cardId}`);
  console.error(`Title: ${title}`);
}

export async function isGitRepo(): Promise<boolean> {
  try {
    await execAsync('git rev-parse --git-dir');
    return true;
  } catch {
    return false;
  }
}

export async function getRemoteUrl(): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git config --get remote.origin.url');
    return stdout.trim();
  } catch {
    return null;
  }
}
