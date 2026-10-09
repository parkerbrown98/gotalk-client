import { ApiError } from '@gotalk/api-client';
import { activeFilterCount, availableSorts, feedParams, parseFeedParams, type FeedFilters, type FeedTopic } from '@gotalk/core';
import { Button, Icon, NavRow, Notice, PillTabs, Stack, Text, useTheme } from '@gotalk/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { ChannelList } from '@/components/channel-list';
import { CreateBoardDialog } from '@/components/create-board-dialog';
import { ActiveFilters, FeedCard, FeedFrame, FeedItemMenu, FeedList, FiltersDialog, MarkAllDialog, SortBar, useVoteMode } from '@/components/feed';
import { InstanceIcon } from '@/components/instance-summary';
import { PlaceMenuSheet, usePlaceMenu } from '@/components/place-menu';
import { ScreenFrame } from '@/components/screen-frame';
import { useSession } from '@/lib/auth';
import { classifyFailure } from '@/lib/failure';
import { useFeedActions, useFeedCapabilities, usePlaceFeed, useSortPreference } from '@/lib/feeds';
import { boardTree } from '@/lib/forums';
import { useActiveInstance } from '@/lib/instances';
import { goBack, useWide } from '@/lib/layout';
import { useBoards, useChannels, usePlace, usePlaceAccess, usePlaceActions, type Place } from '@/lib/places';

type PhoneView = 'feed' | 'browse';

/**
 * A place's front page: who the place is (name, description, counts, join or invite), then its feed.
 * Phones have no sidebar, so a switch under the header also lists the forums and channels.
 */
export default function PlaceScreen() {
  const theme = useTheme();
  const c = theme.colors;
  const wide = useWide();
  const params = useLocalSearchParams<Record<string, string>>();
  const slug = params.slug!;
  const active = useActiveInstance();
  const session = useSession();
  const placeQuery = usePlace(slug);
  const place = placeQuery.data;
  const access = usePlaceAccess(place);
  const readable = access.isMember || place?.visibility === 'public';
  const boardNodes = boardTree(useBoards(slug, readable).data ?? []);
  const channels = useChannels(slug, access.isMember).data ?? [];
  const menu = usePlaceMenu(place);
  const caps = useFeedCapabilities();
  const prefs = useSortPreference('place');
  const voteMode = useVoteMode();
  const feedActions = useFeedActions();
  const [view, setView] = useState<PhoneView>('feed');
  const [sheet, setSheet] = useState(false);
  const [newForum, setNewForum] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [markAll, setMarkAll] = useState(false);
  const [menuItem, setMenuItem] = useState<FeedTopic | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const votes = caps.votes && (place?.voting_enabled ?? false);
  const sorts = availableSorts(caps.sorts, votes);
  const parsed = useMemo(() => parseFeedParams(params, prefs.pref), [params, prefs.pref]);
  const filters: FeedFilters = sorts.includes(parsed.sort) ? parsed : { ...parsed, sort: 'hot', window: undefined };
  const feed = usePlaceFeed(place?.slug, filters, !!place && readable && prefs.loaded && (wide || view === 'feed'));
  const board = filters.board ? boardNodes.find((n) => n.board.id === filters.board)?.board : undefined;

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

  const change = (next: FeedFilters) => {
    router.setParams(feedParams(next));
    if (next.sort !== filters.sort || next.window !== filters.window) prefs.remember({ sort: next.sort, window: next.window });
  };
  const empty = activeFilterCount(filters)
    ? filters.hideRead
      ? 'You have read everything that matches. New replies bring topics back.'
      : 'No topics match these filters.'
    : boardNodes.some((n) => n.board.kind === 'board')
      ? 'No topics yet. Open a forum to start the first one.'
      : 'No topics yet.';
  const canMarkAll = access.isMember && feed.items.length + feed.pinned.length > 0;
  const markAllButton = canMarkAll ? <Button title="Mark all as read" variant="tertiary" size="sm" onPress={() => setMarkAll(true)} /> : null;

  const header = (
    <PlaceHeader
      place={place}
      origin={active.origin}
      isMember={access.isMember}
      forums={boardNodes.filter((n) => n.board.kind === 'board').length}
      channels={channels.length}
      invite={menu.items.find((i) => i.key === 'invite')?.onPress}
      actions={wide ? markAllButton : null}
    />
  );
  const viewSwitch = wide ? null : (
    <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
      <PillTabs
        options={[
          { value: 'feed', label: 'Feed' },
          { value: 'browse', label: 'Forums and chat' },
        ]}
        value={view}
        onChange={setView}
      />
    </View>
  );
  const feedHeader = (
    <View>
      {header}
      {readable ? viewSwitch : null}
      {readable ? (
        <>
          <SortBar sorts={sorts} filters={filters} onChange={change} onFilters={() => setFiltersOpen(true)} trailing={wide ? null : markAllButton} />
          <ActiveFilters filters={filters} boards={boardNodes} onChange={change} />
          {problem ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
              <Notice tone="danger">{problem}</Notice>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );

  const section = (label: string) => (
    <Text variant="captionMd" tone="muted" style={{ paddingHorizontal: 10, paddingTop: 10, paddingBottom: 2 }}>
      {label}
    </Text>
  );
  const browse = (
    <View style={{ paddingHorizontal: theme.space.sm }}>
      {access.isMember ? <NavRow label="Search" icon="search" onPress={() => router.push({ pathname: '/places/[slug]/search', params: { slug: place.slug } })} /> : null}
      {boardNodes.length > 0 ? section('Forums') : null}
      {boardNodes.map(({ board: b, depth }) => (
        <View key={b.id} style={{ marginLeft: depth * 12 }}>
          <NavRow label={b.name} icon="forum" onPress={() => router.push({ pathname: '/places/[slug]/boards/[id]', params: { slug: place.slug, id: b.id } })} />
        </View>
      ))}
      {access.can('MANAGE_BOARDS') ? <NavRow label="New forum" icon="plus" onPress={() => setNewForum(true)} /> : null}
      {access.isMember ? <ChannelList slug={place.slug} channels={channels} canManage={access.can('MANAGE_CHANNELS')} wide={false} /> : null}
      {boardNodes.length + channels.length === 0 && !access.can('MANAGE_CHANNELS') ? (
        <Text variant="bodySm" tone="muted" style={{ padding: theme.space.md }}>
          Nothing here yet. Forums and chat channels appear as they are added.
        </Text>
      ) : null}
    </View>
  );

  let body: ReactNode;
  if (!readable) {
    body = <ScrollView>{header}</ScrollView>;
  } else if (!wide && view === 'browse') {
    body = (
      <ScrollView contentContainerStyle={{ paddingBottom: theme.space.lg }}>
        {header}
        {viewSwitch}
        {browse}
      </ScrollView>
    );
  } else {
    body = (
      <FeedList
        feed={feed}
        header={feedHeader}
        empty={empty}
        renderCard={(item) => (
          <FeedCard
            item={item}
            wide={wide}
            showPlace={false}
            vote={voteMode(item)}
            onOpen={() => router.push({ pathname: '/places/[slug]/topics/[id]', params: { slug: item.place.slug, id: item.id } })}
            onMenu={session ? () => setMenuItem(item) : undefined}
          />
        )}
      />
    );
  }

  return (
    <FeedFrame
      title={place.name}
      onBack={() => goBack('/home')}
      end={
        menu.items.length > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`${place.name} menu`} hitSlop={12} onPress={() => setSheet(true)}>
            <Icon name="more" size={20} color={c.onDark} />
          </Pressable>
        ) : undefined
      }
    >
      {body}
      <FiltersDialog visible={filtersOpen} onClose={() => setFiltersOpen(false)} filters={filters} onChange={change} boards={boardNodes} canHideRead={!!session} showPinned />
      <FeedItemMenu item={menuItem} visible={!!menuItem} onClose={() => setMenuItem(null)} onError={setProblem} />
      <MarkAllDialog
        visible={markAll}
        onClose={() => setMarkAll(false)}
        description={`Every topic ${board ? `in ${board.name}` : `in ${place.name}`} that was active before you opened this feed will show as read. Topics with activity since then stay unread.`}
        onConfirm={() => feedActions.markAllRead(place, feed.asOf ?? new Date().toISOString(), filters.board)}
      />
      <PlaceMenuSheet items={menu.items} visible={sheet} onClose={() => setSheet(false)} />
      {menu.dialogs}
      <CreateBoardDialog slug={place.slug} visible={newForum} onClose={() => setNewForum(false)} />
    </FeedFrame>
  );
}

/** The top of a place's page: icon, name, description, counts, and joining or inviting. */
function PlaceHeader({
  place,
  origin,
  isMember,
  forums,
  channels,
  invite,
  actions,
}: {
  place: Place;
  origin: string;
  isMember: boolean;
  forums: number;
  channels: number;
  invite?: () => void;
  actions?: ReactNode;
}) {
  const theme = useTheme();
  const wide = useWide();
  const placeActions = usePlaceActions();
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  async function join() {
    setJoining(true);
    setJoinError(null);
    try {
      await placeActions.join(place.slug);
    } catch (e) {
      const f = classifyFailure(e);
      setJoinError(f.kind === 'rejected' ? f.message : 'Could not join the place. Try again.');
    } finally {
      setJoining(false);
    }
  }

  const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
  const meta = [
    plural(place.member_count, 'member', 'members'),
    isMember ? plural(forums, 'forum', 'forums') : null,
    isMember ? plural(channels, 'channel', 'channels') : null,
    `since ${new Date(place.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`,
  ]
    .filter(Boolean)
    .join(' · ');

  const join_ = !isMember ? (
    place.visibility === 'public' ? (
      <Stack gap="sm" style={wide ? { alignSelf: 'flex-start' } : undefined}>
        <Button title="Join place" onPress={join} loading={joining} />
        {joinError ? <Notice tone="danger">{joinError}</Notice> : null}
      </Stack>
    ) : (
      <Notice tone="warning" title="This place is by invitation.">
        Ask a member for an invite link to join.
      </Notice>
    )
  ) : null;

  return (
    <Stack gap="md" style={{ paddingHorizontal: 16, paddingTop: wide ? theme.space.xl : theme.space.lg, paddingBottom: theme.space.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: wide ? theme.space.lg : theme.space.md }}>
        <InstanceIcon name={place.name} iconUrl={place.icon_url} origin={origin} size={wide ? 56 : 48} />
        <Stack gap="xxs" style={{ flex: 1 }}>
          <Text variant={wide ? 'headingLg' : 'headingSm'} accessibilityRole="header">
            {place.name}
          </Text>
          <Text variant="captionMd" tone="muted">
            {meta}
          </Text>
        </Stack>
        {wide ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
            {actions}
            {invite ? <Button title="Invite people" size="sm" onPress={invite} /> : null}
          </View>
        ) : null}
      </View>
      {place.description ? (
        <Text variant="bodySm" tone="muted">
          {place.description}
        </Text>
      ) : null}
      {join_}
    </Stack>
  );
}
