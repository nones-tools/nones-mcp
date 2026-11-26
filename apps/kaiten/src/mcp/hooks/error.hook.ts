import type { ToolHook } from '../../interfaces';
import { KaitenApiError, KaitenConfigError, KaitenTimeoutError } from '../../kaiten';
import { ambientToolLogger, type ToolLogger } from '../logger';

/**
 * Catches failures from the handler and formats them into the exact error
 * contract of the pre-refactor server: `Tool <name> failed: <message>`,
 * with an ` (HTTP <status>)` suffix for KaitenApiError.
 */
export function createErrorHook(logger: ToolLogger): ToolHook {
  return async (ctx, next) => {
    try {
      await next();
    } catch (error) {
      const message = safeMessage(error instanceof Error ? error.message : String(error));
      const code = error instanceof KaitenConfigError ? error.code : error instanceof KaitenTimeoutError ? 'TIMEOUT' : error instanceof KaitenApiError ? 'API_ERROR' : 'INVALID_CONFIGURATION';
      let text = `Tool ${ctx.toolName} failed: [${code}] ${message}`;
      if (error instanceof KaitenApiError) {
        text += ` (HTTP ${error.status})`;
        logger.error('Tool error:', { toolName: ctx.toolName, code, message, httpStatus: error.status });
      } else {
        logger.error('Tool error:', { toolName: ctx.toolName, message });
      }
      ctx.response = {
        isError: true,
        content: [{ type: 'text', text }],
      };
    }
  };
}

/** Standalone default, bound to the lazily resolved ambient level. */
export const errorHook: ToolHook = createErrorHook(ambientToolLogger);

function safeMessage(message: string): string {
  return message
    .replace(/Bearer\s+[^\s,]+/gi, 'Bearer [REDACTED]')
    .replace(/([?&](?:token|access_token|api[_-]?key)=)[^&\s]+/gi, '$1[REDACTED]');
}
