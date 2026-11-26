import type { ToolContext, ToolHook, ToolTerminal } from '../../interfaces';

/**
 * Composes hooks (chain of responsibility, koa-style) around a terminal
 * handler: `compose([a, b], t)` runs a -> b -> t, with each hook free to
 * act before/after `next()` or catch errors from further down the chain.
 */
export function compose(hooks: ToolHook[], terminal: ToolTerminal): (ctx: ToolContext) => Promise<void> {
  return (ctx: ToolContext): Promise<void> => {
    const dispatch = (i: number): Promise<void> => {
      if (i === hooks.length) return terminal(ctx);
      return hooks[i]!(ctx, () => dispatch(i + 1));
    };
    return dispatch(0);
  };
}
