import { describe, expect, test } from 'bun:test';
import { filterTools, tools } from '@/mcp/tools';

/**
 * US5 (specs/001-agent-guardrails): `KAITEN_DISABLED_TOOLS` hides tools from
 * registration. `filterTools` is the pure function `server.ts` calls at
 * startup - tested directly here against the real tool registry so the
 * "relative order preserved" assertion is meaningful against the frozen
 * contract order asserted in tests/mcp-tools.test.ts.
 */
describe('filterTools', () => {
  test('named tools are absent from the kept list', () => {
    const { kept } = filterTools(tools, ['kaiten_delete_card', 'kaiten_move_card']);
    const names = kept.map((t) => t.name);
    expect(names).not.toContain('kaiten_delete_card');
    expect(names).not.toContain('kaiten_move_card');
    expect(kept.length).toBe(tools.length - 2);
  });

  test('relative order of survivors matches the original registry order', () => {
    const disabledNames = ['kaiten_card', 'kaiten_users', 'kaiten_attach_file'];
    const { kept } = filterTools(tools, disabledNames);
    const expectedOrder = tools.map((t) => t.name).filter((n) => !disabledNames.includes(n));
    expect(kept.map((t) => t.name)).toEqual(expectedOrder);
  });

  test('a name matching no tool is reported as unknown and does not affect the kept list', () => {
    const { kept, unknown } = filterTools(tools, ['kaiten_does_not_exist']);
    expect(unknown).toEqual(['kaiten_does_not_exist']);
    expect(kept).toHaveLength(tools.length);
    expect(kept.map((t) => t.name)).toEqual(tools.map((t) => t.name));
  });

  test('a mix of known and unknown names: known removed, unknown reported', () => {
    const { kept, unknown } = filterTools(tools, ['kaiten_delete_card', 'not_a_real_tool']);
    expect(unknown).toEqual(['not_a_real_tool']);
    expect(kept.map((t) => t.name)).not.toContain('kaiten_delete_card');
    expect(kept).toHaveLength(tools.length - 1);
  });

  test('empty array leaves the full registry unchanged (same reference)', () => {
    const { kept, unknown } = filterTools(tools, []);
    expect(kept).toBe(tools);
    expect(unknown).toEqual([]);
  });

  test('null leaves the full registry unchanged (same reference)', () => {
    const { kept, unknown } = filterTools(tools, null);
    expect(kept).toBe(tools);
    expect(unknown).toEqual([]);
  });

  test('undefined leaves the full registry unchanged (same reference)', () => {
    const { kept, unknown } = filterTools(tools, undefined);
    expect(kept).toBe(tools);
    expect(unknown).toEqual([]);
  });
});
