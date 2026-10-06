import { channelSections } from '@gotalk/core';
import { Icon, ListCard, ListRow, Notice, Stack, Text, useTheme } from '@gotalk/ui';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { PlaceSettingsPage, usePlaceSettings } from '@/components/place-settings';
import { overwriteTargetLabel } from '@/components/roles';
import { boardTree } from '@/lib/forums';
import { useOverwrites, type OverwriteKind } from '@/lib/moderation';
import { useBoards, useChannels, type Board, type Channel } from '@/lib/places';

export default function PermissionsList() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { place, access } = usePlaceSettings(slug);
  const forums = access.can('MANAGE_BOARDS');
  const chat = access.can('MANAGE_CHANNELS');
  const boards = useBoards(place?.slug, forums);
  const channels = useChannels(place?.slug, chat);

  if (!place) return null;
  if (!forums && !chat) return <Redirect href={{ pathname: '/places/[slug]/settings', params: { slug: place.slug } }} />;
  const nodes = boardTree(boards.data ?? []);
  const sections = channelSections((channels.data ?? []).filter((c) => c.kind === 'text' || c.kind === 'voice' || c.kind === 'category'));
  const chatRows: { channel: Channel; depth: number }[] = [
    ...sections.loose.map((channel) => ({ channel, depth: 0 })),
    ...sections.categories.flatMap((g) => [{ channel: g.category, depth: 0 }, ...g.channels.map((channel) => ({ channel, depth: 1 }))]),
    ...sections.voice.map((channel) => ({ channel, depth: 0 })),
  ];

  return (
    <PlaceSettingsPage
      slug={place.slug}
      title="Permissions"
      description="Override what a role can do in one forum or channel. Overrides on a category or a parent forum apply to everything inside it."
    >
      <Stack gap="xl">
        {forums ? (
          <Stack gap="sm">
            <Text variant="captionMd" tone="muted">
              Forums
            </Text>
            {boards.isPending ? <ActivityIndicator /> : null}
            {boards.isError ? <Notice tone="danger">Forums could not be loaded.</Notice> : null}
            {boards.isSuccess && nodes.length === 0 ? (
              <Text variant="bodySm" tone="muted">
                No forums yet.
              </Text>
            ) : null}
            {nodes.length > 0 ? (
              <ListCard>
                {nodes.map(({ board, depth }) => (
                  <TargetRow key={board.id} slug={place.slug} kind="board" target={board} depth={depth} />
                ))}
              </ListCard>
            ) : null}
          </Stack>
        ) : null}
        {chat ? (
          <Stack gap="sm">
            <Text variant="captionMd" tone="muted">
              Chat and voice
            </Text>
            {channels.isPending ? <ActivityIndicator /> : null}
            {channels.isError ? <Notice tone="danger">Channels could not be loaded.</Notice> : null}
            {channels.isSuccess && chatRows.length === 0 ? (
              <Text variant="bodySm" tone="muted">
                No channels yet.
              </Text>
            ) : null}
            {chatRows.length > 0 ? (
              <ListCard>
                {chatRows.map(({ channel, depth }) => (
                  <TargetRow key={channel.id} slug={place.slug} kind="channel" target={channel} depth={depth} />
                ))}
              </ListCard>
            ) : null}
          </Stack>
        ) : null}
      </Stack>
    </PlaceSettingsPage>
  );
}

function TargetRow({ slug, kind, target, depth }: { slug: string; kind: OverwriteKind; target: Board | Channel; depth: number }) {
  const theme = useTheme();
  const overwrites = useOverwrites(kind, target.id);
  const count = overwrites.data?.length;
  const { title, icon } = overwriteTargetLabel(kind, target);
  const category = target.kind === 'category';
  const what = count === undefined ? '' : count === 0 ? 'No overrides' : `${count} ${count === 1 ? 'override' : 'overrides'}`;
  return (
    <ListRow
      leading={
        <View style={{ marginLeft: depth * 16 }}>
          <Icon name={icon} size={16} color={theme.colors.mute} />
        </View>
      }
      title={title}
      subtitle={[category ? 'Category' : '', what].filter(Boolean).join(' · ') || undefined}
      chevron
      onPress={() => router.push({ pathname: '/places/[slug]/settings/permissions/[id]', params: { slug, id: target.id, kind } })}
    />
  );
}
