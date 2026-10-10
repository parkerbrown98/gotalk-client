import { createGotalkClient, unwrap } from '@gotalk/api-client';
import { DiscoveryError, discoverInstance, normalizeInstanceInput, serverParam, type DiscoveredInstance } from '@gotalk/core';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { Href } from 'expo-router';

import { refusedHint } from './connectivity';
import { instancesStore } from './instances';

export type AccountTab = 'sign-in' | 'create';

/**
 * The welcome screen: the server choice with no `server`, or the account step for one. Old `/connect`,
 * `/sign-in` and `/register` links redirect here.
 */
export function welcomeHref(origin?: string | null, tab?: AccountTab): Href {
  if (!origin) return '/welcome';
  return { pathname: '/welcome', params: { server: serverParam(origin), ...(tab === 'create' ? { tab: 'create' } : {}) } };
}

const serverKey = (param: string) => ['server', param.trim().toLowerCase()] as const;

/** A server's details for the account step, looked up without saving it to the device. */
export function useServer(param: string | undefined) {
  return useQuery({
    queryKey: serverKey(param ?? ''),
    enabled: !!param,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: () => discoverInstance(param!),
  });
}

/** Looks a server up from what someone typed and keeps the result for the account step. */
export async function lookUpServer(qc: QueryClient, input: string): Promise<DiscoveredInstance> {
  const found = await discoverInstance(input);
  qc.setQueryData(serverKey(serverParam(found.origin)), found);
  return found;
}

/** Warms the cache, so the account step for Gotalk Official opens without a wait. */
export function prefetchServer(qc: QueryClient, param: string) {
  void qc.prefetchQuery({ queryKey: serverKey(param), queryFn: () => discoverInstance(param), staleTime: 5 * 60_000, retry: false });
}

/** One sentence for a failed look-up, with the refused-connection hint where it may apply. */
export function describeLookupError(e: unknown, input: string): string {
  if (e instanceof DiscoveryError) {
    if (e.code !== 'unreachable' && e.code !== 'timeout') return e.message;
    let origin: string | undefined;
    try {
      origin = normalizeInstanceInput(input).at(-1);
    } catch {
      origin = undefined;
    }
    const hint = refusedHint(origin);
    return hint ? `${e.message} ${hint}` : e.message;
  }
  return 'Something went wrong while looking that up. Check the address and try again.';
}

/** Saves the server to this device and makes it the active one: after signing in, signing up or choosing to browse. */
export function adoptServer(server: DiscoveredInstance) {
  return instancesStore.getState().addInstance(server);
}

/** A client for a server that is not saved yet; public endpoints only. */
export function publicClient(server: DiscoveredInstance) {
  return createGotalkClient({ baseUrl: server.apiBaseUrl });
}

/** Policies people must accept to sign up on a server. */
export function useSignUpPolicies(server: DiscoveredInstance | undefined) {
  return useQuery({
    queryKey: ['server-policies', server?.id],
    enabled: !!server,
    staleTime: 5 * 60_000,
    queryFn: async () => (unwrap(await publicClient(server!).GET('/policies')) ?? []).filter((p) => p.requires_consent),
  });
}
