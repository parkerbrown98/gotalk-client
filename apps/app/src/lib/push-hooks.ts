import { unwrap } from '@gotalk/api-client';
import { pushPreferencesWith, type PushPreferences, type PushUnavailableReason } from '@gotalk/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { useApiClient, useOnAppFocus } from './api';
import { useSession } from './auth';
import { useActiveInstance } from './instances';
import { pushPlatform, type PushPermission } from './push-platform';

/** Whether this device can receive pushes at all, and the notification permission; rechecked on focus. */
export function usePushDevice(): { unsupported: PushUnavailableReason | null; permission: PushPermission | null; recheck: () => void } {
  const [state, setState] = useState<{ unsupported: PushUnavailableReason | null; permission: PushPermission | null }>({ unsupported: null, permission: null });
  const recheck = useCallback(() => {
    void Promise.all([pushPlatform.unsupportedReason(), pushPlatform.permission()])
      .then(([unsupported, permission]) => setState({ unsupported, permission }))
      .catch(() => setState({ unsupported: null, permission: 'default' }));
  }, []);
  useEffect(recheck, [recheck]);
  // Permission is changed in system or browser settings, outside the app.
  useOnAppFocus(recheck);
  return { ...state, recheck };
}

/** The account's push categories, quiet hours and pause. Shared by every device. */
export function usePushPreferences() {
  const active = useActiveInstance();
  const session = useSession();
  const client = useApiClient();
  return useQuery({
    queryKey: ['push-preferences', active?.id],
    enabled: !!client && !!session,
    queryFn: async () => unwrap(await client!.GET('/users/@me/push-preferences')),
  });
}

/** Turns one category on or off, keeping the rest of the preferences. Optimistic. */
export function useSetPushCategory() {
  const active = useActiveInstance();
  const client = useApiClient();
  const queryClient = useQueryClient();
  const key = ['push-preferences', active?.id];
  return useMutation({
    mutationFn: async ({ category, enabled }: { category: string; enabled: boolean }) => {
      const current = queryClient.getQueryData<PushPreferences>(key) ?? { categories: {} };
      return unwrap(await client!.PUT('/users/@me/push-preferences', { body: pushPreferencesWith(current, category, enabled) }));
    },
    onMutate: async ({ category, enabled }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PushPreferences>(key);
      if (previous) queryClient.setQueryData(key, { ...previous, categories: { ...previous.categories, [category]: enabled } });
      return { previous };
    },
    onError: (_e, _v, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSuccess: (data) => queryClient.setQueryData(key, data),
  });
}

/** The devices that receive this account's pushes. */
export function usePushSubscriptions() {
  const active = useActiveInstance();
  const session = useSession();
  const client = useApiClient();
  return useQuery({
    queryKey: ['push-subscriptions', active?.id],
    enabled: !!client && !!session,
    queryFn: async () => unwrap(await client!.GET('/users/@me/push-subscriptions')) ?? [],
  });
}
