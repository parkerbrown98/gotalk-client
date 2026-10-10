import { ApiError, unwrap, type GotalkClient } from '@gotalk/api-client';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { authManager, useSession } from './auth';
import { useGatewayReady } from './connection';
import { instancesStore, useActiveInstance } from './instances';

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
  const query = useQuery({
    queryKey: ['instance', active?.id],
    enabled: !!client,
    queryFn: async () => unwrap(await client!.GET('/instance')),
    staleTime: 5 * 60_000,
  });
  const id = active?.id;
  const data = query.data;
  // The saved instance on this device follows a renamed instance or a new icon.
  useEffect(() => {
    if (id && data) instancesStore.getState().refresh(id, data);
  }, [id, data]);
  return query;
}

/**
 * Runs `callback` when the window (web, desktop) or the app (phones) comes back to the foreground.
 * Used where something may have changed outside the app, such as confirming an email in the browser.
 */
export function useOnAppFocus(callback: () => void, enabled = true): void {
  const latest = useRef(callback);
  useEffect(() => {
    latest.current = callback;
  });
  useEffect(() => {
    if (!enabled) return;
    const run = () => latest.current();
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') return;
      const onVisible = () => document.visibilityState === 'visible' && run();
      window.addEventListener('focus', run);
      document.addEventListener('visibilitychange', onVisible);
      return () => {
        window.removeEventListener('focus', run);
        document.removeEventListener('visibilitychange', onVisible);
      };
    }
    const sub = AppState.addEventListener('change', (state) => state === 'active' && run());
    return () => sub.remove();
  }, [enabled]);
}

/**
 * The signed-in user. The gateway reports an ended session and profile changes; while it is down,
 * polling is how a session revoked from another device is noticed (the failing request signs this device out).
 */
export function useMe() {
  const active = useActiveInstance();
  const session = useSession();
  const client = useApiClient();
  const live = useGatewayReady();
  return useQuery({
    queryKey: ['me', active?.id],
    enabled: !!client && !!session,
    queryFn: async () => unwrap(await client!.GET('/users/@me')),
    refetchInterval: live ? false : 60_000,
    refetchOnWindowFocus: !live,
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
