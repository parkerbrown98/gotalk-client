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

export { ApiError, unwrap } from './errors.ts';
export * from './uploads.ts';
