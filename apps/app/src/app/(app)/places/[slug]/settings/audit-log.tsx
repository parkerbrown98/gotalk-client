import { unwrap } from '@gotalk/api-client';
import { AUDIT_CATEGORIES, auditUserIds, describeAuditEntry, relativeTime } from '@gotalk/core';
import { Avatar, Button, Icon, ListCard, Notice, PillTabs, Stack, Text, useTheme } from '@gotalk/ui';
import { useQueries, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { PlaceSettingsPage, usePlaceSettings } from '@/components/place-settings';
import { useApiClient } from '@/lib/api';
import { useActiveInstance } from '@/lib/instances';
import { moderationKeys, useAuditLog, useBans, useRoles, type AuditEntry, type Report } from '@/lib/moderation';
import { useBoards, useChannels } from '@/lib/places';

export default function AuditLog() {
  const theme = useTheme();
  const { slug, target, name } = useLocalSearchParams<{ slug: string; target?: string; name?: string }>();
  const { place, access } = usePlaceSettings(slug);
  const allowed = access.can('VIEW_AUDIT_LOG');
  const [category, setCategory] = useState('');
  const log = useAuditLog(place?.slug, { action: category, targetId: target }, allowed);
  const roles = useRoles(place?.slug, allowed).data;
  const channels = useChannels(place?.slug, allowed).data;
  const boards = useBoards(place?.slug, allowed).data;
  const entries = useMemo(() => log.data?.pages.flatMap((p) => p.items ?? []) ?? [], [log.data]);
  const userIds = useMemo(() => [...new Set(entries.flatMap(auditUserIds))], [entries]);
  const people = usePeopleNames(place?.id, place?.slug, userIds, access.can('BAN_MEMBERS'));

  if (!place) return null;
  if (!allowed) return <Redirect href={{ pathname: '/places/[slug]/settings', params: { slug: place.slug } }} />;

  const names = {
    user: (id: string) => people[id] ?? (id === target ? name : undefined),
    role: (id: string) => roles?.find((r) => r.id === id)?.name,
    channel: (id: string) => channels?.find((c) => c.id === id)?.name,
    board: (id: string) => boards?.find((b) => b.id === id)?.name,
  };

  return (
    <PlaceSettingsPage slug={place.slug} title="Audit log" description="Every moderation and administration action in this place, newest first.">
      <Stack gap="lg">
        {target ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm, padding: theme.space.md, borderRadius: theme.radii.md, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.hairline }}>
            <Icon name="user" size={16} color={theme.colors.mute} />
            <Text variant="bodySm" style={{ flex: 1 }}>
              Showing actions on {name || 'one person'}
            </Text>
            <Pressable accessibilityRole="button" hitSlop={6} onPress={() => router.setParams({ target: undefined, name: undefined })}>
              <Text variant="bodySm" tone="onDark" style={{ textDecorationLine: 'underline' }}>
                Clear filter
              </Text>
            </Pressable>
          </View>
        ) : null}
        <PillTabs options={AUDIT_CATEGORIES} value={category} onChange={setCategory} />
        {log.isPending ? <ActivityIndicator /> : null}
        {log.isError ? (
          <Stack gap="sm">
            <Notice tone="danger" title="The audit log could not be loaded.">
              Check your connection and try again.
            </Notice>
            <Button title="Try again" variant="tertiary" onPress={() => void log.refetch()} style={{ alignSelf: 'flex-start' }} />
          </Stack>
        ) : null}
        {log.isSuccess && entries.length === 0 ? (
          <Text variant="bodySm" tone="muted">
            Nothing recorded{category ? ' in this category' : ''}{target ? ` for ${name || 'this person'}` : ''} yet.
          </Text>
        ) : null}
        {entries.length > 0 ? (
          <ListCard>
            {entries.map((e) => (
              <EntryRow key={e.id} entry={e} names={names} />
            ))}
          </ListCard>
        ) : null}
        {log.hasNextPage ? <Button title="Load older entries" variant="tertiary" loading={log.isFetchingNextPage} onPress={() => void log.fetchNextPage()} /> : null}
      </Stack>
    </PlaceSettingsPage>
  );
}

/**
 * Display names for the people entries mention. Members are looked up one by one; people who have left
 * (kicked, banned) are found in the bans list and in reports already loaded, since the API has no way
 * to look a user up by ID.
 */
function usePeopleNames(placeId: string | undefined, slug: string | undefined, ids: string[], canBans: boolean): Record<string, string> {
  const client = useApiClient();
  const inst = useActiveInstance()?.id;
  const qc = useQueryClient();
  const bans = useBans(slug, canBans);
  const members = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['member', inst, placeId, id],
      enabled: !!client && !!placeId,
      staleTime: 10 * 60_000,
      retry: false,
      queryFn: async () => unwrap(await client!.GET('/places/{place}/members/{userID}', { params: { path: { place: placeId!, userID: id } } })),
    })),
  });
  const out: Record<string, string> = {};
  for (const [, data] of qc.getQueriesData<InfiniteData<{ items?: Report[] | null }>>({ queryKey: moderationKeys.reports(inst, slug) })) {
    for (const r of data?.pages.flatMap((p) => p.items ?? []) ?? []) {
      out[r.target_user.id] = r.target_user.display_name;
      out[r.reporter.id] = r.reporter.display_name;
    }
  }
  for (const b of bans.data?.pages.flatMap((p) => p.items ?? []) ?? []) out[b.user.id] = b.user.display_name;
  for (const m of members) if (m.data) out[m.data.user.id] = m.data.user.display_name;
  return out;
}

function EntryRow({ entry, names }: { entry: AuditEntry; names: Parameters<typeof describeAuditEntry>[1] }) {
  const theme = useTheme();
  const line = describeAuditEntry(entry, names);
  const report = entry.action.startsWith('report.');
  return (
    <View style={{ flexDirection: 'row', gap: theme.space.md, paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md }}>
      <Avatar name={line.actor} uri={entry.actor_id ? entry.actor?.avatar_url : null} size={32} />
      <Stack gap="xs" style={{ flex: 1 }}>
        <Text variant="bodySm">
          <Text variant="bodySmStrong" tone="onDark">
            {line.actor}
          </Text>{' '}
          {line.summary}
        </Text>
        {line.reason ? (
          <Text variant="captionMd" tone="muted">
            {report ? `Note: ${line.reason}` : `“${line.reason}”`}
          </Text>
        ) : null}
        {line.detail ? (
          <Text variant="captionMd" tone="faint" numberOfLines={3}>
            {line.detail}
          </Text>
        ) : null}
      </Stack>
      <Text variant="captionMd" tone="muted">
        {relativeTime(entry.created_at)}
      </Text>
    </View>
  );
}
