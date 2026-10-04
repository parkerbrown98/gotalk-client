import { ApiError, createGotalkClient, unwrap, type Instance } from '@gotalk/api-client';

import { checkCompatibility, type Compatibility } from './compat.ts';

/** Response of `GET /.well-known/gotalk-instance` (served outside the OpenAPI document). */
export interface WellKnownInstance {
  api_base_url: string;
  api_versions: string[];
  gateway_url: string;
  instance_info_url: string;
  instance_url: string;
  software: string;
  version: string;
}

export interface DiscoveredInstance {
  /** Stable identifier for the instance on this device: its origin, e.g. `https://forum.example`. */
  id: string;
  origin: string;
  apiBaseUrl: string;
  gatewayUrl: string;
  /** False when the API is reached over plain HTTP (allowed, but worth warning about). */
  secure: boolean;
  instance: Instance;
  compatibility: Compatibility;
}

export type DiscoveryErrorCode = 'invalid_input' | 'unreachable' | 'not_gotalk' | 'timeout';

export class DiscoveryError extends Error {
  readonly code: DiscoveryErrorCode;

  constructor(code: DiscoveryErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DiscoveryError';
    this.code = code;
  }
}

const LOCAL_HOST = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|[^.:]+\.local|[^.:]+)(:\d+)?$/i;

/**
 * Turns what a user typed ("forum.example", "https://forum.example/some/page",
 * "localhost:8080") into candidate origins to probe, in order. Plain hosts default to HTTPS;
 * local/LAN hosts try HTTP first since they rarely have certificates.
 */
export function normalizeInstanceInput(raw: string): string[] {
  const input = raw.trim();
  if (!input) throw new DiscoveryError('invalid_input', 'Enter an instance address.');

  // Parsed by hand: React Native's URL implementation is incomplete.
  const withScheme = /^([a-z][a-z0-9+.-]*):\/\/([^/?#\s]+)/i.exec(input);
  if (withScheme) {
    const scheme = withScheme[1]!.toLowerCase();
    const authority = withScheme[2]!.toLowerCase();
    if (scheme !== 'http' && scheme !== 'https') {
      throw new DiscoveryError('invalid_input', 'Use an http:// or https:// address.');
    }
    if (authority.includes('@')) throw new DiscoveryError('invalid_input', 'Addresses cannot include credentials.');
    return [`${scheme}://${authority}`];
  }

  const host = input.split(/[/?#]/, 1)[0]!.toLowerCase();
  if (!/^(\[[0-9a-f:]+\]|[a-z0-9.-]+)(:\d{1,5})?$/.test(host)) {
    throw new DiscoveryError('invalid_input', `"${input}" is not a valid address.`);
  }
  return LOCAL_HOST.test(host) ? [`http://${host}`, `https://${host}`] : [`https://${host}`];
}

export interface DiscoverOptions {
  fetch?: typeof globalThis.fetch;
  /** Per-request timeout. Defaults to 10 seconds. */
  timeoutMs?: number;
}

async function fetchWithTimeout(fetchFn: typeof globalThis.fetch, url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } catch (e) {
    if (controller.signal.aborted) throw new DiscoveryError('timeout', `Timed out connecting to ${url}.`, { cause: e });
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveApi(
  origin: string,
  fetchFn: typeof globalThis.fetch,
  timeoutMs: number,
): Promise<{ apiBaseUrl: string; gatewayUrl?: string }> {
  const res = await fetchWithTimeout(fetchFn, `${origin}/.well-known/gotalk-instance`, timeoutMs);
  if (res.ok) {
    const body = (await res.json().catch(() => null)) as Partial<WellKnownInstance> | null;
    if (body?.api_base_url && body.software === 'gotalk') {
      return { apiBaseUrl: body.api_base_url.replace(/\/+$/, ''), gatewayUrl: body.gateway_url };
    }
    throw new DiscoveryError('not_gotalk', `${origin} does not look like a Gotalk instance.`);
  }
  if (res.status === 404) return { apiBaseUrl: `${origin}/api/v1` };
  throw new DiscoveryError('unreachable', `${origin} responded with ${res.status}.`);
}

/** Resolves user input to a Gotalk instance, reading its metadata and checking compatibility. */
export async function discoverInstance(input: string, options: DiscoverOptions = {}): Promise<DiscoveredInstance> {
  const fetchFn = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
  const timeoutMs = options.timeoutMs ?? 10_000;
  const candidates = normalizeInstanceInput(input);

  let lastError: unknown;
  for (const origin of candidates) {
    try {
      const { apiBaseUrl, gatewayUrl } = await resolveApi(origin, fetchFn, timeoutMs);
      const client = createGotalkClient({ baseUrl: apiBaseUrl, fetch: fetchFn });
      let instance: Instance;
      try {
        instance = unwrap(await client.GET('/instance'));
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          throw new DiscoveryError('not_gotalk', `${origin} does not look like a Gotalk instance.`, { cause: e });
        }
        throw e;
      }
      if (!instance?.api || instance.software?.name !== 'gotalk') {
        throw new DiscoveryError('not_gotalk', `${origin} does not look like a Gotalk instance.`);
      }
      return {
        id: origin,
        origin,
        apiBaseUrl,
        gatewayUrl: instance.api.gateway_url || gatewayUrl || '',
        secure: apiBaseUrl.startsWith('https://'),
        instance,
        compatibility: checkCompatibility(instance.api),
      };
    } catch (e) {
      // A definitive answer from a server is final; only connection failures try the next candidate.
      if (e instanceof DiscoveryError && e.code === 'not_gotalk') throw e;
      lastError = e;
    }
  }
  if (lastError instanceof DiscoveryError) throw lastError;
  throw new DiscoveryError('unreachable', `Could not reach ${candidates[0]}.`, { cause: lastError });
}
