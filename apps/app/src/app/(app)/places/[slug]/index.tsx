import { ApiError } from '@gotalk/api-client';
import { Button, Icon, NavRow, Notice, Stack, Text, useTheme } from '@gotalk/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { ChannelList } from '@/components/channel-list';
import { CreateBoardDialog } from '@/components/create-board-dialog';
import { InstanceIcon } from '@/components/instance-summary';
import { PlaceMenuSheet, usePlaceMenu } from '@/components/place-menu';
import { ScreenFrame } from '@/components/screen-frame';
import { classifyFailure } from '@/lib/failure';
import { boardTree } from '@/lib/forums';
import { useActiveInstance } from '@/lib/instances';
import { goBack, useWide } from '@/lib/layout';
import { useBoards, useChannels, usePlace, usePlaceAccess, usePlaceActions } from '@/lib/places';

export default function PlaceScreen() {
  const theme = useTheme();
  const c = theme.colors;
  const wide = useWide();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const active = useActiveInstance();
  const placeQuery = usePlace(slug);
  const place = placeQuery.data;
  const access = usePlaceAccess(place);
  const boardNodes = boardTree(useBoards(slug, access.isMember).data ?? []);
  const boards = boardNodes.filter((n) => n.board.kind === 'board');
  const [newForum, setNewForum] = useState(false);
  const channels = useChannels(slug, access.isMember).data ?? [];
  const menu = usePlaceMenu(place);
  const actions = usePlaceActions();
  const [sheet, setSheet] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  if (!active) return null;

  if (placeQuery.isPending) return <ActivityIndicator style={{ flex: 1 }} />;
  if (!place) {
    const gone = placeQuery.error instanceof ApiError && placeQuery.error.status < 500;
    return (
      <ScreenFrame title="Place" onBack={() => goBack('/home')}>
        <Stack gap="lg">
          <Notice tone="danger" title={gone ? 'This place is private or does not exist.' : 'The place could not be loaded.'}>
            {gone ? 'Ask a member for an invite, or look for it in Discover.' : 'Check your connection and try again.'}
          </Notice>
          <Button title="Discover places" variant="tertiary" onPress={() => router.replace('/discover')} />
        </Stack>
      </ScreenFrame>
    );
  }

  const text = channels.filter((ch) => ch.kind === 'text');
  const voice = channels.filter((ch) => ch.kind === 'voice');

  async function join() {
    setJoining(true);
    setJoinError(null);
    try {
      await actions.join(place!.slug);
    } catch (e) {
      const f = classifyFailure(e);
      setJoinError(f.kind === 'rejected' ? f.message : 'Could not join the place. Try again.');
    } finally {
      setJoining(false);
    }
  }

  const joinBlock = !access.isMember ? (
    place.visibility === 'public' ? (
      <Stack gap="sm">
        <Button title="Join place" onPress={join} loading={joining} />
        {joinError ? <Notice tone="danger">{joinError}</Notice> : null}
      </Stack>
    ) : (
      <Notice tone="warning" title="This place is by invitation.">
        Ask a member for an invite link to join.
      </Notice>
    )
  ) : null;

  if (wide) {
    const invite = menu.items.find((i) => i.key === 'invite');
    return (
      <ScreenFrame title={place.name} maxWidth={800} contentStyle={{ paddingVertical: theme.space.xxl, paddingHorizontal: 40 }}>
        <Stack gap="xl">
          <Stack direction="row" gap="lg" align="center">
            <InstanceIcon name={place.name} iconUrl={place.icon_url} origin={active.origin} size={64} />
            <Stack gap="xs" style={{ flex: 1 }}>
              <Text variant="headingXl" accessibilityRole="header">
                {place.name}
              </Text>
              {place.description ? (
                <Text variant="bodySm" tone="muted">
                  {place.description}
                </Text>
              ) : null}
            </Stack>
            {invite ? <Button title="Invite people" onPress={invite.onPress} /> : null}
          </Stack>
          {joinBlock}
          <Stack direction="row" gap="xxl">
            <Stat value={place.member_count.toLocaleString()} label={place.member_count === 1 ? 'member' : 'members'} />
            {access.isMember ? <Stat value={String(boards.length)} label={boards.length === 1 ? 'forum' : 'forums'} /> : null}
            {access.isMember ? <Stat value={String(text.length + voice.length)} label={text.length + voice.length === 1 ? 'channel' : 'channels'} /> : null}
            <Stat value={new Date(place.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })} label="created" />
          </Stack>
          {access.isMember && boards.length + text.length + voice.length === 0 ? (
            <Notice tone="info" title="Nothing here yet.">
              Forums and chat channels appear in the sidebar as they are added.
            </Notice>
          ) : null}
          {menu.dialogs}
        </Stack>
      </ScreenFrame>
    );
  }

  const section = (label: string) => (
    <Text variant="captionMd" tone="muted" style={{ paddingHorizontal: 10, paddingTop: 10, paddingBottom: 2 }}>
      {label}
    </Text>
  );
  return (
    <ScreenFrame
      title={place.name}
      onBack={() => goBack('/home')}
      end={
        menu.items.length > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`${place.name} menu`} hitSlop={12} onPress={() => setSheet(true)}>
            <Icon name="more" size={20} color={c.onDark} />
          </Pressable>
        ) : undefined
      }
      contentStyle={{ padding: theme.space.sm }}
    >
      <Stack gap="sm">
        {!access.isMember ? (
          <Stack gap="md" style={{ padding: theme.space.md }}>
            <Stack direction="row" gap="md" align="center">
              <InstanceIcon name={place.name} iconUrl={place.icon_url} origin={active.origin} size={48} />
              <Stack gap="none" style={{ flex: 1 }}>
                <Text variant="headingSm">{place.name}</Text>
                <Text variant="captionMd" tone="muted">
                  {place.member_count.toLocaleString()} {place.member_count === 1 ? 'member' : 'members'}
                </Text>
              </Stack>
            </Stack>
            {place.description ? (
              <Text variant="bodySm" tone="muted">
                {place.description}
              </Text>
            ) : null}
            {joinBlock}
          </Stack>
        ) : (
          <View>
            {access.isMember ? <NavRow label="Search" icon="search" onPress={() => router.push({ pathname: '/places/[slug]/search', params: { slug: place.slug } })} /> : null}
            {boardNodes.length > 0 ? section('Forums') : null}
            {boardNodes.map(({ board: b, depth }) => (
              <View key={b.id} style={{ marginLeft: depth * 12 }}>
                <NavRow label={b.name} icon="forum" onPress={() => router.push({ pathname: '/places/[slug]/boards/[id]', params: { slug: place.slug, id: b.id } })} />
              </View>
            ))}
            {access.can('MANAGE_BOARDS') ? <NavRow label="New forum" icon="plus" onPress={() => setNewForum(true)} /> : null}
            <ChannelList slug={place.slug} channels={channels} canManage={access.can('MANAGE_CHANNELS')} wide={false} />
            {boardNodes.length + text.length + voice.length === 0 && !access.can('MANAGE_CHANNELS') ? (
              <Text variant="bodySm" tone="muted" style={{ padding: theme.space.md }}>
                Nothing here yet. Forums and chat channels appear as they are added.
              </Text>
            ) : null}
          </View>
        )}
      </Stack>
      <PlaceMenuSheet items={menu.items} visible={sheet} onClose={() => setSheet(false)} />
      {menu.dialogs}
      <CreateBoardDialog slug={place.slug} visible={newForum} onClose={() => setNewForum(false)} />
    </ScreenFrame>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <Stack gap="none">
      <Text variant="headingMd">{value}</Text>
      <Text variant="captionMd" tone="muted">
        {label}
      </Text>
    </Stack>
  );
}
