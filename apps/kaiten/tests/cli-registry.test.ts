import { describe, expect, it, mock } from 'bun:test';
import type { CliCommand, CliDeps } from '@/interfaces';
import type { KaitenSDK } from '@/sdk';
import { buildRegistry, commands } from '@/cli/registry';

const fakeDeps: CliDeps = {
  getSdk(): KaitenSDK {
    throw new Error('getSdk must not be called by these tests');
  },
};

describe('buildRegistry (unit)', () => {
  it('maps a command by name and by every alias to the same object', () => {
    const cmd: CliCommand = { name: 'foo', aliases: ['f', 'foo-cmd'], run: async () => {} };
    const registry = buildRegistry([cmd]);
    expect(registry.get('foo')).toBe(cmd);
    expect(registry.get('f')).toBe(cmd);
    expect(registry.get('foo-cmd')).toBe(cmd);
    expect(registry.size).toBe(3);
  });

  it('returns undefined for an unknown command name', () => {
    const registry = buildRegistry([{ name: 'foo', run: async () => {} }]);
    expect(registry.get('bogus-command')).toBeUndefined();
  });

  it('throws on duplicate names or aliases instead of silently overriding', () => {
    const a: CliCommand = { name: 'dup', run: async () => {} };
    const b: CliCommand = { name: 'other', aliases: ['dup'], run: async () => {} };
    expect(() => buildRegistry([a, b])).toThrow('Duplicate CLI command name or alias: dup');
  });

  it('dispatches run() with the full argv (command name at index 0) and deps', async () => {
    const run = mock(async (_argv: string[], _deps: CliDeps) => {});
    const registry = buildRegistry([{ name: 'foo', run }]);
    const argv = ['foo', '42', '--minimal'];
    await registry.get('foo')!.run(argv, fakeDeps);
    expect(run).toHaveBeenCalledWith(argv, fakeDeps);
  });
});

describe('the real command registry', () => {
  const registry = buildRegistry();

  it('contains every documented command name', () => {
    const expected = [
      'cards', 'card', 'simple', 'card-simple', 'create', 'update', 'delete', 'move', 'assign',
      'subtask', 'comment', 'board', 'column', 'user', 'tag', 'find',
      'git-branch', 'git-checkout', 'git-commit', 'git-push', 'git-status', 'init', 'mcp', 'help',
    ];
    for (const name of expected) {
      expect(registry.has(name)).toBe(true);
    }
    expect(commands).toHaveLength(expected.length);
  });

  it('resolves the historical aliases to the same commands', () => {
    expect(registry.get('list-cards')).toBe(registry.get('cards')!);
    expect(registry.get('get-card')).toBe(registry.get('card')!);
    expect(registry.get('--help')).toBe(registry.get('help')!);
    expect(registry.get('-h')).toBe(registry.get('help')!);
  });

  it('has no entry for an unknown command (dispatcher then prints the error and exits 1)', () => {
    expect(registry.get('bogus-command')).toBeUndefined();
    expect(registry.get('undefined')).toBeUndefined();
  });

  it('help command runs without an SDK (prints usage only)', async () => {
    const logs: string[] = [];
    const original = console.log;
    console.log = (msg?: unknown) => {
      logs.push(String(msg));
    };
    try {
      await registry.get('help')!.run(['help'], fakeDeps);
    } finally {
      console.log = original;
    }
    expect(logs.join('\n')).toContain('Kaiten CLI - Полнофункциональный CLI для Kaiten API');
  });
});
