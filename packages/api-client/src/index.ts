import createClient, { type Client, type Middleware } from 'openapi-fetch';

import type { components, operations, paths } from './schema.ts';

export type { components, operations, paths };
export type Schemas = components['schemas'];
export type Instance = Schemas['Instance'];
export type ProblemDetails = Schemas['ErrorModel'];

/** API version this client was generated against; sent on every request. */
export const API_VERSION = 'v1';
export const API_VERSION_HEADER = 'Gotalk-Api-Version';

export type GotalkClient = Client<paths>;

export interface GotalkClientOptions {
  /** API base URL including the version prefix, e.g. `https://forum.example/api/v1`. */
  baseUrl: string;
  /** Returns the bearer token to send, if any. Called per request so tokens can rotate. */
  getAccessToken?: () => string | null | undefined | Promise<string | null | undefined>;
  fetch?: typeof globalThis.fetch;
  /** Sent as `User-Agent`. Leave unset in browsers, which forbid scripts from setting it. */
  userAgent?: string;
}

export function createGotalkClient(options: GotalkClientOptions): GotalkClient {
  const client = createClient<paths>({
    baseUrl: options.baseUrl.replace(/\/+$/, ''),
    fetch: options.fetch ?? ((input) => globalThis.fetch(input)),
  });
  const headers: Middleware = {
    async onRequest({ request }) {
      request.headers.set(API_VERSION_HEADER, API_VERSION);
      if (options.userAgent) request.headers.set('User-Agent', options.userAgent);
      const token = await options.getAccessToken?.();
      if (token) request.headers.set('Authorization', `Bearer ${token}`);
      return request;
    },
  };
  client.use(headers);
  return client;
}

/** Error thrown by {@link unwrap} carrying the server's RFC 9457 problem details. */
export class ApiError extends Error {
  readonly status: number;
  readonly problem: Partial<ProblemDetails> | undefined;
  /** Seconds to wait before retrying, from `Retry-After` (sent with 429 and 503). */
  readonly retryAfter: number | undefined;

  constructor(status: number, problem?: Partial<ProblemDetails>, retryAfter?: number) {
    super(problem?.detail || problem?.title || `Request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.problem = problem;
    this.retryAfter = retryAfter;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }

  /** The instance refused the `Gotalk-Api-Version` header this client sends. */
  get isVersionMismatch(): boolean {
    return this.status === 400 && /API version .* is not supported/i.test(this.message);
  }

  /** Detail messages the server attached to individual body fields, keyed by field name. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const e of this.problem?.errors ?? []) {
      const field = e.location?.replace(/^body\./, '');
      if (field && e.message && !(field in out)) out[field] = e.message;
    }
    return out;
  }
}

function parseRetryAfter(response: Response): number | undefined {
  const raw = response.headers.get('Retry-After');
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
  const at = Date.parse(raw);
  return Number.isNaN(at) ? undefined : Math.max(0, Math.ceil((at - Date.now()) / 1000));
}

/** Converts an openapi-fetch result into its data, throwing {@link ApiError} on failure. */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.error !== undefined || !result.response.ok) {
    const problem = typeof result.error === 'object' && result.error !== null ? (result.error as Partial<ProblemDetails>) : undefined;
    throw new ApiError(result.response.status, problem, parseRetryAfter(result.response));
  }
  return result.data as T;
}
