import type { HttpTransport, QueryParams } from '../interfaces';
import { KaitenApiError, KaitenDeleteDisabledError, KaitenReadOnlyError } from './errors';
import { fetchWithTimeout, withRetries } from './policy';

export interface KaitenClientOptions {
  apiUrl: string;
  apiToken: string;
  fetchImpl?: typeof fetch;
  /**
   * Explicit opt-in for HTTP DELETE calls. Defaults to `false` - `delete()`
   * throws `KaitenDeleteDisabledError` before making any request unless this
   * is `true`. This is the single enforcement point: every DELETE anywhere
   * in the API layer goes through `KaitenClient.delete()`, so nothing can
   * bypass the gate.
   */
  allowDelete?: boolean;
  /**
   * When `true`, `post`/`patch`/`putForm`/`delete` all throw
   * `KaitenReadOnlyError` before any request is made - wins over
   * `allowDelete` (deletes are writes too). `get`/`getBuffer` are unaffected.
   * Defaults to `false`.
   */
  readOnly?: boolean;
  /**
   * Aborts any HTTP request that takes longer than this many ms, throwing
   * `KaitenTimeoutError`. `null`/unset (default) = no timeout, current
   * behavior unchanged.
   */
  timeoutMs?: number | null;
  /**
   * Extra retry attempts on transient failures, for GET requests only
   * (`request`'s GET path and `getBuffer`). Writes are never retried.
   * `null`/unset (default) = no retries, current behavior unchanged.
   */
  retries?: number | null;
}

export type { QueryParams } from '../interfaces';

/** Adapts native `fetch` to the `HttpTransport` contract the API layer uses. */
export class KaitenClient implements HttpTransport {
  private readonly apiUrl: string;
  private readonly apiToken: string;
  private readonly fetchImpl: typeof fetch;
  private readonly allowDelete: boolean;
  private readonly readOnly: boolean;
  private readonly timeoutMs: number | null;
  private readonly retries: number;

  constructor(options: KaitenClientOptions) {
    this.apiUrl = options.apiUrl.replace(/\/+$/, '');
    this.apiToken = options.apiToken;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.allowDelete = options.allowDelete ?? false;
    this.readOnly = options.readOnly ?? false;
    this.timeoutMs = options.timeoutMs ?? null;
    this.retries = options.retries ?? 0;
  }

  private buildUrl(path: string, query?: QueryParams): string {
    const url = new URL(this.apiUrl + (path.startsWith('/') ? path : `/${path}`));
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  /** `post`/`patch`/`putForm`/`delete` all call this before touching the network. */
  private assertWritable(): void {
    if (this.readOnly) throw new KaitenReadOnlyError();
  }

  /** Single fetch attempt, timeout-wrapped only when `timeoutMs` is configured. */
  private fetchOnce(method: string, path: string, url: string, init: RequestInit): Promise<Response> {
    return this.timeoutMs != null
      ? fetchWithTimeout(this.fetchImpl, url, init, this.timeoutMs, method, path)
      : this.fetchImpl(url, init);
  }

  private async parseBody(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  private async parseJsonResponse<T>(response: Response, method: string, path: string): Promise<T> {
    if (!response.ok) {
      const errorBody = await this.parseBody(response);
      throw new KaitenApiError(
        response.status,
        errorBody,
        `Kaiten API request failed: ${method} ${path} -> ${response.status}`
      );
    }
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    { query, body }: { query?: QueryParams; body?: unknown } = {}
  ): Promise<T> {
    const url = this.buildUrl(path, query);
    const init: RequestInit = { method, headers: this.headers(), body: body !== undefined ? JSON.stringify(body) : undefined };
    const attempt = async () => this.parseJsonResponse<T>(await this.fetchOnce(method, path, url, init), method, path);
    // Only GET is retried - POST/PATCH/DELETE are never idempotent-safe.
    return method === 'GET' ? withRetries(attempt, this.retries) : attempt();
  }

  get<T>(path: string, query?: QueryParams): Promise<T> {
    return this.request<T>('GET', path, { query });
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    this.assertWritable();
    return this.request<T>('POST', path, { body });
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    this.assertWritable();
    return this.request<T>('PATCH', path, { body });
  }

  async delete<T>(path: string): Promise<T> {
    this.assertWritable();
    if (!this.allowDelete) throw new KaitenDeleteDisabledError();
    return this.request<T>('DELETE', path);
  }

  /**
   * PUT with a `FormData` body (multipart file upload). Deliberately omits
   * `Content-Type` - `fetch` derives `multipart/form-data; boundary=...`
   * from the `FormData` instance itself; setting it manually would drop the
   * boundary and break the upload.
   */
  async putForm<T>(path: string, form: FormData): Promise<T> {
    this.assertWritable();
    const url = this.buildUrl(path);
    const init: RequestInit = {
      method: 'PUT',
      headers: { Authorization: `Bearer ${this.apiToken}`, Accept: 'application/json' },
      body: form,
    };
    const response = await this.fetchOnce('PUT', path, url, init);
    return this.parseJsonResponse<T>(response, 'PUT', path);
  }

  async getBuffer(path: string): Promise<Buffer> {
    const url = this.buildUrl(path);
    const init: RequestInit = { method: 'GET', headers: this.headers() };
    const attempt = async () => {
      const response = await this.fetchOnce('GET', path, url, init);
      if (!response.ok) {
        const errorBody = await this.parseBody(response);
        throw new KaitenApiError(
          response.status,
          errorBody,
          `Kaiten API request failed: GET ${path} -> ${response.status}`
        );
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    };
    return withRetries(attempt, this.retries);
  }
}
