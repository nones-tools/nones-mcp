import type { ToolHook } from '../../interfaces';
import { ambientToolLogger, type ToolLogger } from '../logger';

/** Outermost hook: debug-logs every tool invocation (honors the runtime's level). */
export function createLoggingHook(logger: ToolLogger): ToolHook {
  return async (ctx, next) => {
    logger.debug(`Tool called: ${ctx.toolName}`, ctx.args);
    await next();
  };
}

/** Standalone default, bound to the lazily resolved ambient level. */
export const loggingHook: ToolHook = createLoggingHook(ambientToolLogger);
