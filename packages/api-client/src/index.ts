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
}

export function createGotalkClient(options: GotalkClientOptions): GotalkClient {
  const client = createClient<paths>({
    baseUrl: options.baseUrl.replace(/\/+$/, ''),
    fetch: options.fetch ?? ((input) => globalThis.fetch(input)),
  });
  const headers: Middleware = {
    async onRequest({ request }) {
      request.headers.set(API_VERSION_HEADER, API_VERSION);
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

  constructor(status: number, problem?: Partial<ProblemDetails>) {
    super(problem?.detail || problem?.title || `Request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.problem = problem;
  }
}

/** Converts an openapi-fetch result into its data, throwing {@link ApiError} on failure. */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.error !== undefined || !result.response.ok) {
    const problem = typeof result.error === 'object' && result.error !== null ? (result.error as Partial<ProblemDetails>) : undefined;
    throw new ApiError(result.response.status, problem);
  }
  return result.data as T;
}
