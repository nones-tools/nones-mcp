import { describe, expect, it } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';

const CLI_PATH = path.join(import.meta.dir, '..', 'src', 'cli', 'index.ts');

interface CliResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

function cleanEnv(home: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined || key.startsWith('KAITEN_')) continue;
    env[key] = value;
  }
  env.HOME = home;
  return env;
}

// Spawns the CLI as a real subprocess (`bun src/cli/index.ts ...`) rather than
// importing it directly, since the module calls process.exit() and runs
// its logic at import time - importing it in-process would kill the test
// runner. cwd is a fresh temp dir and KAITEN_* env vars (plus HOME, so
// `~/.kaiten/config` can't leak in) are stripped so no real credentials or
// config files are picked up and no network calls can succeed.
function runCli(args: string[]): CliResult {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaiten-cli-test-'));
  try {
    const result = Bun.spawnSync(['bun', CLI_PATH, ...args], {
      cwd: tmpDir,
      env: cleanEnv(tmpDir),
      stdout: 'pipe',
      stderr: 'pipe',
    });

    return {
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

describe('cli', () => {
  it('help prints the usage text and exits 0', () => {
    const { exitCode, stdout, stderr } = runCli(['help']);
    expect(stderr).toBe('');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Kaiten CLI - Полнофункциональный CLI для Kaiten API');
    expect(stdout).toContain('kaiten <command> [args]');
    expect(stdout).toContain("git-branch <card_id>             - Создать ветку для задачи");
    expect(stdout).toContain('--minimal, -m');
  });

  it('--help and -h behave the same as help', () => {
    for (const flag of ['--help', '-h']) {
      const { exitCode, stdout } = runCli([flag]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Kaiten CLI - Полнофункциональный CLI для Kaiten API');
    }
  });

  it('init imports credentials from the project .env into the global config', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaiten-cli-init-test-'));
    const projectDir = path.join(tmpDir, 'project');
    const homeDir = path.join(tmpDir, 'home');
    fs.mkdirSync(projectDir);
    fs.mkdirSync(homeDir);
    fs.writeFileSync(
      path.join(projectDir, '.env'),
      'KAITEN_API_URL=https://team.kaiten.ru/api/latest\nKAITEN_API_TOKEN=secret\n'
    );

    try {
      const result = Bun.spawnSync(['bun', CLI_PATH, 'init'], {
        cwd: projectDir,
        env: cleanEnv(homeDir),
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const configPath = path.join(homeDir, '.kaiten', 'config');

      expect(result.exitCode).toBe(0);
      expect(result.stderr.toString()).toBe('');
      expect(result.stdout.toString()).toContain('MCP can now start with: npx -y @nones/kaiten-mcp mcp');
      expect(result.stdout.toString()).not.toContain('secret');
      expect(fs.readFileSync(configPath, 'utf8')).toContain('KAITEN_API_TOKEN=secret');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('an unknown command exits 1 and mentions the command', () => {
    const { exitCode, stderr } = runCli(['bogus-command']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Unknown command: bogus-command');
  });

  it('"card" with no ID exits 1 with "Error: Card ID required" and makes no network call', () => {
    const { exitCode, stderr } = runCli(['card']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Error: Card ID required');
  });

  it('"card-simple" with no ID exits 1 with "Error: Card ID required"', () => {
    const { exitCode, stderr } = runCli(['card-simple']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Error: Card ID required');
  });

  it('"git-branch" with no ID exits 1 with "Error: Card ID required"', () => {
    const { exitCode, stderr } = runCli(['git-branch']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Error: Card ID required');
  });
});
