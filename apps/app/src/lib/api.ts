import { createGotalkClient, unwrap, type GotalkClient } from '@gotalk/api-client';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useActiveInstance } from './instances';

/** API client bound to the active instance (unauthenticated until sign-in lands). */
export function useApiClient(): GotalkClient | null {
  const active = useActiveInstance();
  const baseUrl = active?.apiBaseUrl;
  return useMemo(() => (baseUrl ? createGotalkClient({ baseUrl }) : null), [baseUrl]);
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
