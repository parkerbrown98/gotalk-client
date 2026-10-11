import { ApiError, unwrap } from '@gotalk/api-client';
import { memberRoleColor } from '@gotalk/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useApiClient } from './api';
import { chatKeys } from './chat';
import { useActiveInstance } from './instances';
import { moderationKeys, useRoles, type Member } from './moderation';
import { useMyPlaces } from './places';

/** Place-scoped decoration only: no member requests for DMs, nonmembers or uncolored places. */
export function useRoleColor(placeId: string | null | undefined, userId: string | undefined) {
  const inst = useActiveInstance()?.id;
  const client = useApiClient();
  const qc = useQueryClient();
  const place = useMyPlaces().data?.find((p) => p.id === placeId);
  const roles = useRoles(place?.slug, !!userId);
  const enabled = !!client && !!place && !!userId && !!roles.data?.some((r) => r.color);
  const cachedList = place ? qc.getQueryState<Member[]>(chatKeys.members(inst, place.slug)) : undefined;
  const cachedMember = place ? qc.getQueryState<Member>(moderationKeys.member(inst, place.slug, userId)) : undefined;
  const seed = cachedMember?.data ?? cachedList?.data?.find((m) => m.user.id === userId);
  const member = useQuery({
    // Shared with typing indicators; each distinct author is fetched once, not once per row.
    queryKey: ['member', inst, placeId, userId],
    enabled,
    staleTime: 60_000,
    initialData: seed,
    initialDataUpdatedAt: cachedMember?.data ? cachedMember.dataUpdatedAt : cachedList?.dataUpdatedAt,
    queryFn: async (): Promise<Member | null> => {
      try {
        return unwrap(await client!.GET('/places/{place}/members/{userID}', { params: { path: { place: placeId!, userID: userId! } } }));
      } catch (e) {
        // Old content remains after an author leaves; they no longer have a place role.
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
  });
  const error = place && userId ? roles.error ?? (enabled ? member.error : null) : null;
  useEffect(() => {
    if (error) console.warn('Could not load author role color', error);
  }, [error]);
  return {
    color: place && userId && member.data && roles.data ? memberRoleColor(roles.data, member.data.role_ids) : null,
    error,
  };
}
