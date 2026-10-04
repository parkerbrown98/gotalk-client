import { ApiError, unwrap, type GotalkClient } from '@gotalk/api-client';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { authManager, useSession } from './auth';
import { useActiveInstance } from './instances';

/** API client bound to the active instance. It sends the session's token and refreshes it as needed. */
export function useApiClient(): GotalkClient | null {
  const active = useActiveInstance();
  const id = active?.id;
  const apiBaseUrl = active?.apiBaseUrl;
  return useMemo(() => (id && apiBaseUrl ? authManager.clientFor({ id, apiBaseUrl }) : null), [id, apiBaseUrl]);
}

export function useInstanceInfo() {
  const active = useActiveInstance();
  const client = useApiClient();
  return useQuery({
    queryKey: ['instance', active?.id],
    enabled: !!client,
    queryFn: async () => unwrap(await client!.GET('/instance')),
    staleTime: 5 * 60_000,
  });
}

/**
 * The signed-in user. Polling is how a session revoked from another device is noticed until the
 * gateway arrives in Phase 4: the failing request signs this device out.
 */
export function useMe() {
  const active = useActiveInstance();
  const session = useSession();
  const client = useApiClient();
  return useQuery({
    queryKey: ['me', active?.id],
    enabled: !!client && !!session,
    queryFn: async () => unwrap(await client!.GET('/users/@me')),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

/** Policies awaiting this user's consent. */
export function useConsents() {
  const active = useActiveInstance();
  const session = useSession();
  const client = useApiClient();
  return useQuery({
    queryKey: ['consents', active?.id],
    enabled: !!client && !!session,
    queryFn: async () => unwrap(await client!.GET('/users/@me/consents')),
  });
}

/** Policies in effect, for the sign-up consent checkbox. Public. */
export function usePolicies() {
  const active = useActiveInstance();
  const client = useApiClient();
  return useQuery({
    queryKey: ['policies', active?.id],
    enabled: !!client,
    queryFn: async () => (unwrap(await client!.GET('/policies')) ?? []).filter((p) => p.requires_consent),
    staleTime: 5 * 60_000,
  });
}

/** Retry transient failures only; a 4xx answer will not change on a second try. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status < 500 && error.status !== 429) return false;
  return failureCount < 2;
}
