import type { ToolHook } from '../../interfaces';
import { KaitenApiError, KaitenConfigError, KaitenTimeoutError } from '../../kaiten';
import { errorLog } from '../logger';

/**
 * Catches failures from the handler and formats them into the exact error
 * contract of the pre-refactor server: `Tool <name> failed: <message>`,
 * with an ` (HTTP <status>) - <body>` suffix for KaitenApiError. Plain
 * Error messages (e.g. the actionable missing-config guidance from
 * loadConfig) pass through verbatim inside <message>.
 */
export const errorHook: ToolHook = async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    const message = safeMessage(error instanceof Error ? error.message : String(error));
    const code = error instanceof KaitenConfigError ? error.code : error instanceof KaitenTimeoutError ? 'TIMEOUT' : error instanceof KaitenApiError ? 'API_ERROR' : 'INVALID_CONFIGURATION';
    let text = `Tool ${ctx.toolName} failed: [${code}] ${message}`;
    if (error instanceof KaitenApiError) {
      text += ` (HTTP ${error.status})`;
      errorLog('Tool error:', { toolName: ctx.toolName, code, message, httpStatus: error.status });
    } else {
      errorLog('Tool error:', { toolName: ctx.toolName, message });
    }
    ctx.response = {
      isError: true,
      content: [{ type: 'text', text }],
    };
  }
};

function safeMessage(message: string): string {
  return message
    .replace(/Bearer\s+[^\s,]+/gi, 'Bearer [REDACTED]')
    .replace(/([?&](?:token|access_token|api[_-]?key)=)[^&\s]+/gi, '$1[REDACTED]');
}
