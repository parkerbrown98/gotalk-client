import { unwrap } from '@gotalk/api-client';
import { useQuery } from '@tanstack/react-query';

import { useApiClient } from './api';
import { useSession } from './auth';
import { useActiveInstance } from './instances';

/** This account's active login sessions, one per signed-in device. */
export function useSessions() {
  const active = useActiveInstance();
  const session = useSession();
  const client = useApiClient();
  return useQuery({
    queryKey: ['sessions', active?.id],
    enabled: !!client && !!session,
    queryFn: async () => unwrap(await client!.GET('/users/@me/sessions')) ?? [],
  });
}
