import type { ToolHook } from '../../interfaces';
import { debugLog } from '../logger';

/** Outermost hook: debug-logs every tool invocation to stderr (honors KAITEN_LOG_LEVEL). */
export const loggingHook: ToolHook = async (ctx, next) => {
  debugLog(`Tool called: ${ctx.toolName}`, ctx.args);
  await next();
};
