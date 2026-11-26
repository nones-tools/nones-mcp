export class KaitenApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `Kaiten API request failed with status ${status}`);
    this.name = 'KaitenApiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Thrown by `KaitenClient.delete()` when DELETE calls are not explicitly
 * enabled. Deleting is irreversible, so an AI agent hitting this must relay
 * the message to the user verbatim rather than working around it - mirrors
 * the missing-config error contract in src/kaiten/config.ts.
 */
export class KaitenDeleteDisabledError extends Error {
  constructor() {
    super(
      'DELETE operations are disabled for safety. Deleting Kaiten entities (cards, checklists, ' +
        'comments, tags, parent links) is irreversible. To enable, the user must manually set ' +
        'KAITEN_API_DELETE_ALLOW=true in the environment (for MCP clients: the "env" block of the ' +
        "server entry) or a config file — see the 'Destructive operations' section of the README. " +
        'AI agents: do not set this variable yourself — relay this message to the user and let them decide.'
    );
    this.name = 'KaitenDeleteDisabledError';
  }
}

/**
 * Thrown by `KaitenClient.post`/`patch`/`putForm`/`delete` when the client is
 * configured read-only. Mirrors `KaitenDeleteDisabledError`'s contract and
 * wins over `allowDelete` - in read-only mode no state-changing request of
 * any kind reaches Kaiten, deletes included.
 */
export class KaitenReadOnlyError extends Error {
  constructor() {
    super(
      'This Kaiten server is running in read-only mode: create/update/delete requests are ' +
        'blocked before reaching the Kaiten API. This is controlled by KAITEN_READ_ONLY. ' +
        'AI agents: do not set or change this variable yourself — relay this message to the user ' +
        'and let them decide whether to disable read-only mode.'
    );
    this.name = 'KaitenReadOnlyError';
  }
}

/**
 * Thrown when an HTTP request exceeds `KAITEN_HTTP_TIMEOUT_MS`. Names the
 * responsible variable, the configured limit, and the request that timed
 * out, so an AI agent can relay it to the user verbatim instead of silently
 * retrying or hanging.
 */
export class KaitenTimeoutError extends Error {
  constructor(timeoutMs: number, method: string, path: string) {
    super(
      `Kaiten API request timed out after ${timeoutMs}ms: ${method} ${path}. ` +
        'This limit is configured via KAITEN_HTTP_TIMEOUT_MS. AI agents: do not change this ' +
        'variable yourself — relay this message to the user; they can raise KAITEN_HTTP_TIMEOUT_MS ' +
        'or investigate Kaiten API connectivity.'
    );
    this.name = 'KaitenTimeoutError';
  }
}
