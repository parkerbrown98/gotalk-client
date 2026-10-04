import { unwrap, type Schemas } from '@gotalk/api-client';
import { hasPermission, permissionTable, type PermissionName } from '@gotalk/core';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { useApiClient } from './api';
import { useSession } from './auth';
import { useActiveInstance } from './instances';

export type Place = Schemas['Place'];
export type Board = Schemas['Board'];
export type Channel = Schemas['Channel'];
export type Invite = Schemas['Invite'];
export type InvitePreview = Schemas['InvitePreview'];

/** Places the signed-in user belongs to. */
export function useMyPlaces() {
  const active = useActiveInstance();
  const session = useSession();
  const client = useApiClient();
  return useQuery({
    queryKey: ['places', active?.id],
    enabled: !!client && !!session,
    queryFn: async () => unwrap(await client!.GET('/users/@me/places')) ?? [],
  });
}

/** One place by slug. `my_permissions` is present only when the user is a member. */
export function usePlace(slug: string | undefined) {
  const active = useActiveInstance();
  const client = useApiClient();
  return useQuery({
    queryKey: ['place', active?.id, slug],
    enabled: !!client && !!slug,
    queryFn: async () => unwrap(await client!.GET('/places/{place}', { params: { path: { place: slug! } } })),
  });
}

export function useBoards(slug: string | undefined, enabled = true) {
  const active = useActiveInstance();
  const client = useApiClient();
  return useQuery({
    queryKey: ['boards', active?.id, slug],
    enabled: !!client && !!slug && enabled,
    queryFn: async () => unwrap(await client!.GET('/places/{place}/boards', { params: { path: { place: slug! } } })) ?? [],
  });
}

export function useChannels(slug: string | undefined, enabled = true) {
  const active = useActiveInstance();
  const client = useApiClient();
  return useQuery({
    queryKey: ['channels', active?.id, slug],
    enabled: !!client && !!slug && enabled,
    queryFn: async () => unwrap(await client!.GET('/places/{place}/channels', { params: { path: { place: slug! } } })) ?? [],
  });
}

const DISCOVER_PAGE = 24;

/** Public and invite-only places, most members first, filtered by name or description. */
export function useDiscover(query: string) {
  const active = useActiveInstance();
  const client = useApiClient();
  const q = query.trim();
  return useInfiniteQuery({
    queryKey: ['discover', active?.id, q],
    enabled: !!client,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      unwrap(await client!.GET('/places', { params: { query: { q: q || undefined, limit: DISCOVER_PAGE, offset: pageParam } } })),
    getNextPageParam: (last) => last.next_offset ?? undefined,
  });
}

/** Pending and accepted invites of a place; needs MANAGE_INVITES. */
export function useInvites(slug: string | undefined, enabled: boolean) {
  const active = useActiveInstance();
  const client = useApiClient();
  return useQuery({
    queryKey: ['invites', active?.id, slug],
    enabled: !!client && !!slug && enabled,
    queryFn: async () => unwrap(await client!.GET('/places/{place}/invites', { params: { path: { place: slug! } } })) ?? [],
  });
}

/** The instance's permission bit table. Falls back to the built-in values until it loads. */
function usePermissionTable() {
  const active = useActiveInstance();
  const client = useApiClient();
  const defs = useQuery({
    queryKey: ['permissions', active?.id],
    enabled: !!client,
    staleTime: Infinity,
    queryFn: async () => unwrap(await client!.GET('/permissions')),
  });
  return useMemo(() => permissionTable(defs.data), [defs.data]);
}

export interface PlaceAccess {
  isMember: boolean;
  isOwner: boolean;
  /** Hides what the user cannot do; the server stays authoritative. */
  can: (...names: PermissionName[]) => boolean;
}

export function usePlaceAccess(place: Place | undefined): PlaceAccess {
  const session = useSession();
  const table = usePermissionTable();
  const bits = place?.my_permissions;
  const can = useCallback((...names: PermissionName[]) => hasPermission(bits, names, table), [bits, table]);
  return { isMember: bits !== undefined, isOwner: !!place && !!session && place.owner_id === session.userId, can };
}

/** What the user may do inside one board; board overwrites make this differ from the place-wide permissions. */
export function useBoardAccess(board: Board | undefined): { can: (...names: PermissionName[]) => boolean } {
  const table = usePermissionTable();
  const bits = board?.my_permissions;
  const can = useCallback((...names: PermissionName[]) => hasPermission(bits, names, table), [bits, table]);
  return { can };
}

export interface PlaceInput {
  name: string;
  slug: string;
  description: string;
  visibility: Place['visibility'];
}

/** Mutations for places and invites. Each refreshes the lists that show the change. */
export function usePlaceActions() {
  const active = useActiveInstance();
  const client = useApiClient();
  const queryClient = useQueryClient();
  const id = active?.id;

  const refresh = useCallback(
    async (slug?: string) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['places', id] }),
        queryClient.invalidateQueries({ queryKey: ['discover', id] }),
        slug ? queryClient.invalidateQueries({ queryKey: ['place', id, slug] }) : queryClient.invalidateQueries({ queryKey: ['place', id] }),
      ]);
    },
    [queryClient, id],
  );

  return useMemo(() => {
    const api = () => {
      if (!client) throw new Error('No active instance');
      return client;
    };
    return {
      async create(input: PlaceInput) {
        const place = unwrap(await api().POST('/places', { body: { ...input, locale: 'en' } }));
        await refresh();
        return place;
      },
      async update(slug: string, input: Partial<PlaceInput>) {
        const place = unwrap(await api().PATCH('/places/{place}', { params: { path: { place: slug } }, body: input }));
        await refresh(slug);
        if (place.slug !== slug) await refresh(place.slug);
        return place;
      },
      async remove(slug: string) {
        unwrap(await api().DELETE('/places/{place}', { params: { path: { place: slug } } }));
        await refresh(slug);
      },
      async join(slug: string) {
        const place = unwrap(await api().POST('/places/{place}/join', { params: { path: { place: slug } } }));
        await refresh(slug);
        return place;
      },
      async leave(slug: string) {
        unwrap(await api().POST('/places/{place}/leave', { params: { path: { place: slug } } }));
        await refresh(slug);
      },
      async createInvite(slug: string, options: { maxAgeSeconds: number; maxUses: number }) {
        const invite = unwrap(
          await api().POST('/places/{place}/invites', { params: { path: { place: slug } }, body: { max_age: options.maxAgeSeconds, max_uses: options.maxUses } }),
        );
        await queryClient.invalidateQueries({ queryKey: ['invites', id, slug] });
        return invite;
      },
      async revokeInvite(slug: string, code: string) {
        unwrap(await api().DELETE('/places/{place}/invites/{code}', { params: { path: { place: slug, code } } }));
        await queryClient.invalidateQueries({ queryKey: ['invites', id, slug] });
      },
      async acceptInvite(code: string) {
        const place = unwrap(await api().POST('/invites/{code}', { params: { path: { code } } }));
        await refresh();
        return place;
      },
    };
  }, [client, id, queryClient, refresh]);
}
