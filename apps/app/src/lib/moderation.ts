import { unwrap, type Schemas } from '@gotalk/api-client';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { useApiClient } from './api';
import { chatKeys } from './chat';
import { useActiveInstance } from './instances';

export type Role = Schemas['Role'];
export type Member = Schemas['Member'];
export type Report = Schemas['Report'];
export type Ban = Schemas['Ban'];
export type AuditEntry = Schemas['AuditEntry'];
export type Overwrite = Schemas['Overwrite'];
export type ReportStatus = Report['status'];
export type ReportTarget = { kind: 'post' | 'message' | 'user'; id: string };
export type OverwriteKind = 'board' | 'channel';

const PAGE = 50;

export const moderationKeys = {
  standing: (inst: string | undefined, slug: string | undefined) => ['standing', inst, slug] as const,
  roles: (inst: string | undefined, slug: string | undefined) => ['roles', inst, slug] as const,
  members: (inst: string | undefined, slug: string | undefined) => ['place-members', inst, slug] as const,
  member: (inst: string | undefined, slug: string | undefined, userId: string | undefined) => ['place-member', inst, slug, userId] as const,
  reports: (inst: string | undefined, slug: string | undefined) => ['reports', inst, slug] as const,
  bans: (inst: string | undefined, slug: string | undefined) => ['bans', inst, slug] as const,
  audit: (inst: string | undefined, slug: string | undefined) => ['audit', inst, slug] as const,
  overwrites: (inst: string | undefined, kind: OverwriteKind, id: string | undefined) => ['overwrites', inst, kind, id] as const,
};

function useContext() {
  const active = useActiveInstance();
  const client = useApiClient();
  return { inst: active?.id, client };
}

/** The caller's rank in a place: whether they own it and the position of their highest role. */
export function useStanding(slug: string | undefined, enabled = true) {
  const { inst, client } = useContext();
  return useQuery({
    queryKey: moderationKeys.standing(inst, slug),
    enabled: !!client && !!slug && enabled,
    queryFn: async () => unwrap(await client!.GET('/places/{place}/permissions/@me', { params: { path: { place: slug! } } })),
  });
}

/** Roles, highest first. Any member may read them. */
export function useRoles(slug: string | undefined, enabled = true) {
  const { inst, client } = useContext();
  return useQuery({
    queryKey: moderationKeys.roles(inst, slug),
    enabled: !!client && !!slug && enabled,
    queryFn: async () => unwrap(await client!.GET('/places/{place}/roles', { params: { path: { place: slug! } } })) ?? [],
  });
}

/** Members whose username, display name or nickname starts with `q`, fifty at a time. */
export function useMemberSearch(slug: string | undefined, q: string, enabled = true) {
  const { inst, client } = useContext();
  const query = q.trim();
  return useInfiniteQuery({
    queryKey: [...moderationKeys.members(inst, slug), query],
    enabled: !!client && !!slug && enabled,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      unwrap(await client!.GET('/places/{place}/members', { params: { path: { place: slug! }, query: { q: query || undefined, limit: PAGE, offset: pageParam } } })),
    getNextPageParam: (last) => last.next_offset ?? undefined,
  });
}

/** One member, for the moderation dialog. Fails with 404 once they have left. */
export function usePlaceMember(slug: string | undefined, userId: string | undefined) {
  const { inst, client } = useContext();
  return useQuery({
    queryKey: moderationKeys.member(inst, slug, userId),
    enabled: !!client && !!slug && !!userId,
    queryFn: async () => unwrap(await client!.GET('/places/{place}/members/{userID}', { params: { path: { place: slug!, userID: userId! } } })),
  });
}

export function useReports(slug: string | undefined, status: ReportStatus, enabled = true) {
  const { inst, client } = useContext();
  return useInfiniteQuery({
    queryKey: [...moderationKeys.reports(inst, slug), status],
    enabled: !!client && !!slug && enabled,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => unwrap(await client!.GET('/places/{place}/reports', { params: { path: { place: slug! }, query: { status, limit: PAGE, offset: pageParam } } })),
    getNextPageParam: (last) => last.next_offset ?? undefined,
  });
}

/** How many open reports are waiting, up to one page; the settings nav shows it. */
export function useOpenReportCount(slug: string | undefined, enabled: boolean): number {
  const reports = useReports(slug, 'open', enabled);
  return reports.data?.pages[0]?.items?.length ?? 0;
}

export function useBans(slug: string | undefined, enabled = true) {
  const { inst, client } = useContext();
  return useInfiniteQuery({
    queryKey: moderationKeys.bans(inst, slug),
    enabled: !!client && !!slug && enabled,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => unwrap(await client!.GET('/places/{place}/bans', { params: { path: { place: slug! }, query: { limit: PAGE, offset: pageParam } } })),
    getNextPageParam: (last) => last.next_offset ?? undefined,
  });
}

export function useAuditLog(slug: string | undefined, filter: { action?: string; targetId?: string; actorId?: string }, enabled = true) {
  const { inst, client } = useContext();
  return useInfiniteQuery({
    queryKey: [...moderationKeys.audit(inst, slug), filter.action ?? '', filter.targetId ?? '', filter.actorId ?? ''],
    enabled: !!client && !!slug && enabled,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await client!.GET('/places/{place}/audit-log', {
          params: {
            path: { place: slug! },
            query: { action: filter.action || undefined, target_id: filter.targetId || undefined, actor_id: filter.actorId || undefined, limit: PAGE, offset: pageParam },
          },
        }),
      ),
    getNextPageParam: (last) => last.next_offset ?? undefined,
  });
}

/** A board's or channel's own role overwrites (Manage boards / Manage channels). */
export function useOverwrites(kind: OverwriteKind, id: string | undefined, enabled = true) {
  const { inst, client } = useContext();
  return useQuery({
    queryKey: moderationKeys.overwrites(inst, kind, id),
    enabled: !!client && !!id && enabled,
    queryFn: async () =>
      kind === 'board'
        ? (unwrap(await client!.GET('/boards/{boardID}/overwrites', { params: { path: { boardID: id! } } })) ?? [])
        : (unwrap(await client!.GET('/channels/{channelID}/overwrites', { params: { path: { channelID: id! } } })) ?? []),
  });
}

/** A public profile by username, for banning someone who is not a member. */
export async function lookUpUser(client: ReturnType<typeof useApiClient>, username: string) {
  if (!client) throw new Error('No active instance');
  return unwrap(await client.GET('/users/{username}', { params: { path: { username: username.trim().replace(/^@/, '') } } }));
}

export interface RoleInput {
  name?: string;
  color?: number;
  permissions?: number;
  position?: number;
}

/**
 * Moderation and administration mutations for one place. Each refreshes what shows the change, and the
 * audit log, which records all of them.
 */
export function useModerationActions(slug: string | undefined) {
  const { inst, client } = useContext();
  const qc = useQueryClient();

  const refresh = useCallback(
    async (...keys: (readonly unknown[])[]) => {
      await Promise.all([...keys, moderationKeys.audit(inst, slug)].map((queryKey) => qc.invalidateQueries({ queryKey })));
    },
    [qc, inst, slug],
  );

  return useMemo(() => {
    const api = () => {
      if (!client || !slug) throw new Error('No active instance');
      return client;
    };
    const place = () => ({ place: slug! });
    // Permission changes can change what the caller sees anywhere in the place.
    const permissionsChanged = () =>
      refresh(moderationKeys.roles(inst, slug), moderationKeys.standing(inst, slug), ['place', inst, slug], ['boards', inst, slug], ['channels', inst, slug], ['channel', inst]);
    const membersChanged = (userId: string) =>
      refresh(moderationKeys.members(inst, slug), moderationKeys.member(inst, slug, userId), chatKeys.members(inst, slug), ['member', inst]);

    return {
      async createRole(input: RoleInput & { name: string }) {
        const role = unwrap(await api().POST('/places/{place}/roles', { params: { path: place() }, body: input }));
        await permissionsChanged();
        return role;
      },
      async updateRole(roleId: string, input: RoleInput) {
        const role = unwrap(await api().PATCH('/places/{place}/roles/{roleID}', { params: { path: { ...place(), roleID: roleId } }, body: input }));
        await permissionsChanged();
        return role;
      },
      async deleteRole(roleId: string) {
        unwrap(await api().DELETE('/places/{place}/roles/{roleID}', { params: { path: { ...place(), roleID: roleId } } }));
        await Promise.all([permissionsChanged(), refresh(moderationKeys.members(inst, slug))]);
      },
      async setRole(userId: string, roleId: string, on: boolean) {
        const path = { ...place(), userID: userId, roleID: roleId };
        const member = on
          ? unwrap(await api().PUT('/places/{place}/members/{userID}/roles/{roleID}', { params: { path } }))
          : unwrap(await api().DELETE('/places/{place}/members/{userID}/roles/{roleID}', { params: { path } }));
        qc.setQueryData(moderationKeys.member(inst, slug, userId), member);
        await membersChanged(userId);
        return member;
      },
      async setNickname(userId: string, nickname: string) {
        const member = unwrap(await api().PATCH('/places/{place}/members/{userID}', { params: { path: { ...place(), userID: userId } }, body: { nickname } }));
        qc.setQueryData(moderationKeys.member(inst, slug, userId), member);
        await membersChanged(userId);
        return member;
      },
      async warn(userId: string, reason: string) {
        unwrap(await api().POST('/places/{place}/members/{userID}/warnings', { params: { path: { ...place(), userID: userId } }, body: { reason } }));
        await refresh();
      },
      async timeout(userId: string, seconds: number, reason: string) {
        const member = unwrap(
          await api().PUT('/places/{place}/members/{userID}/timeout', { params: { path: { ...place(), userID: userId } }, body: { duration: seconds, reason: reason || undefined } }),
        );
        qc.setQueryData(moderationKeys.member(inst, slug, userId), member);
        await membersChanged(userId);
        return member;
      },
      async clearTimeout(userId: string) {
        const member = unwrap(await api().DELETE('/places/{place}/members/{userID}/timeout', { params: { path: { ...place(), userID: userId } } }));
        qc.setQueryData(moderationKeys.member(inst, slug, userId), member);
        await membersChanged(userId);
        return member;
      },
      async kick(userId: string, reason: string) {
        unwrap(await api().DELETE('/places/{place}/members/{userID}', { params: { path: { ...place(), userID: userId }, query: { reason: reason || undefined } } }));
        qc.removeQueries({ queryKey: moderationKeys.member(inst, slug, userId) });
        await Promise.all([membersChanged(userId), refresh(['place', inst, slug])]);
      },
      async ban(userId: string, seconds: number, reason: string) {
        unwrap(await api().PUT('/places/{place}/bans/{userID}', { params: { path: { ...place(), userID: userId } }, body: { duration: seconds || undefined, reason: reason || undefined } }));
        qc.removeQueries({ queryKey: moderationKeys.member(inst, slug, userId) });
        await Promise.all([membersChanged(userId), refresh(moderationKeys.bans(inst, slug), ['place', inst, slug])]);
      },
      async unban(userId: string) {
        unwrap(await api().DELETE('/places/{place}/bans/{userID}', { params: { path: { ...place(), userID: userId } } }));
        await refresh(moderationKeys.bans(inst, slug));
      },
      async report(target: ReportTarget, reason: Schemas['CreateReportRequest']['reason'], details: string) {
        const key = target.kind === 'post' ? 'post_id' : target.kind === 'message' ? 'message_id' : 'user_id';
        const report = unwrap(await api().POST('/places/{place}/reports', { params: { path: place() }, body: { reason, details: details.trim() || undefined, [key]: target.id } }));
        await qc.invalidateQueries({ queryKey: moderationKeys.reports(inst, slug) });
        return report;
      },
      async resolveReport(reportId: string, status: 'resolved' | 'dismissed', note: string) {
        const report = unwrap(
          await api().PATCH('/places/{place}/reports/{reportID}', { params: { path: { ...place(), reportID: reportId } }, body: { status, resolution_note: note.trim() || undefined } }),
        );
        await refresh(moderationKeys.reports(inst, slug));
        return report;
      },
      async setOverwrite(kind: OverwriteKind, targetId: string, roleId: string, bits: { allow: number; deny: number }) {
        const ow =
          kind === 'board'
            ? unwrap(await api().PUT('/boards/{boardID}/overwrites/{roleID}', { params: { path: { boardID: targetId, roleID: roleId } }, body: bits }))
            : unwrap(await api().PUT('/channels/{channelID}/overwrites/{roleID}', { params: { path: { channelID: targetId, roleID: roleId } }, body: bits }));
        await Promise.all([refresh(moderationKeys.overwrites(inst, kind, targetId)), permissionsChanged()]);
        return ow;
      },
      async removeOverwrite(kind: OverwriteKind, targetId: string, roleId: string) {
        if (kind === 'board') unwrap(await api().DELETE('/boards/{boardID}/overwrites/{roleID}', { params: { path: { boardID: targetId, roleID: roleId } } }));
        else unwrap(await api().DELETE('/channels/{channelID}/overwrites/{roleID}', { params: { path: { channelID: targetId, roleID: roleId } } }));
        await Promise.all([refresh(moderationKeys.overwrites(inst, kind, targetId)), permissionsChanged()]);
      },
    };
  }, [client, slug, inst, qc, refresh]);
}
