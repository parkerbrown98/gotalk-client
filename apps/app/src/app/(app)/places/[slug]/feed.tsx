import { activeFilterCount, availableSorts, feedParams, parseFeedParams, type FeedFilters, type FeedTopic } from '@gotalk/core';
import { Button, Icon, Notice, Text, useTheme } from '@gotalk/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { ActiveFilters, FeedCard, FeedFrame, FeedItemMenu, FeedList, FiltersDialog, MarkAllDialog, SortBar, useVoteMode } from '@/components/feed';
import { useSession } from '@/lib/auth';
import { useFeedActions, useFeedCapabilities, usePlaceFeed, useSortPreference } from '@/lib/feeds';
import { boardTree } from '@/lib/forums';
import { goBack, useWide } from '@/lib/layout';
import { useBoards, usePlace, usePlaceAccess } from '@/lib/places';

/** Topics from every forum of a place the person can read, ranked. */
export default function PlaceFeed() {
  const theme = useTheme();
  const c = theme.colors;
  const wide = useWide();
  const params = useLocalSearchParams<Record<string, string>>();
  const slug = params.slug!;
  const session = useSession();
  const place = usePlace(slug).data;
  const access = usePlaceAccess(place);
  const caps = useFeedCapabilities();
  const prefs = useSortPreference('place');
  const voteMode = useVoteMode();
  const actions = useFeedActions();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [markAll, setMarkAll] = useState(false);
  const [menuItem, setMenuItem] = useState<FeedTopic | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const votes = caps.votes && (place?.voting_enabled ?? false);
  const sorts = availableSorts(caps.sorts, votes);
  const parsed = useMemo(() => parseFeedParams(params, prefs.pref), [params, prefs.pref]);
  const filters: FeedFilters = sorts.includes(parsed.sort) ? parsed : { ...parsed, sort: 'hot', window: undefined };
  const readable = access.isMember || place?.visibility === 'public';
  const boards = boardTree(useBoards(slug, readable).data ?? []);
  const feed = usePlaceFeed(place?.slug, filters, !!place && prefs.loaded);
  const board = filters.board ? boards.find((n) => n.board.id === filters.board)?.board : undefined;

  const change = (next: FeedFilters) => {
    router.setParams(feedParams(next));
    if (next.sort !== filters.sort || next.window !== filters.window) prefs.remember({ sort: next.sort, window: next.window });
  };

  const markAllButton = session && feed.items.length + feed.pinned.length > 0 ? <Button title="Mark all as read" variant="tertiary" size="sm" onPress={() => setMarkAll(true)} /> : null;
  const header = (
    <View>
      {wide ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md, paddingHorizontal: 16, height: 52, borderBottomWidth: 1, borderBottomColor: c.hairline }}>
          <Icon name="arrowUp" size={16} color={c.mute} />
          <Text variant="bodyStrong" tone="onDark" accessibilityRole="header">
            Feed
          </Text>
          <Text variant="captionMd" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
            {board ? `${board.name} in ${place?.name ?? ''}` : `Every forum in ${place?.name ?? 'this place'}`}
          </Text>
          {markAllButton}
        </View>
      ) : null}
      <SortBar sorts={sorts} filters={filters} onChange={change} onFilters={() => setFiltersOpen(true)} trailing={wide ? null : markAllButton} />
      <ActiveFilters filters={filters} boards={boards} onChange={change} />
      {problem ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <Notice tone="danger">{problem}</Notice>
        </View>
      ) : null}
    </View>
  );

  const empty = activeFilterCount(filters) ? (filters.hideRead ? 'You have read everything that matches. New replies bring topics back.' : 'No topics match these filters.') : 'No topics here yet.';

  return (
    <FeedFrame title="Feed" onBack={() => goBack({ pathname: '/places/[slug]', params: { slug } })}>
      <FeedList
        feed={feed}
        header={header}
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
      <FiltersDialog visible={filtersOpen} onClose={() => setFiltersOpen(false)} filters={filters} onChange={change} boards={boards} canHideRead={!!session} showPinned />
      <FeedItemMenu item={menuItem} visible={!!menuItem} onClose={() => setMenuItem(null)} onError={setProblem} />
      {place ? (
        <MarkAllDialog
          visible={markAll}
          onClose={() => setMarkAll(false)}
          description={`Every topic ${board ? `in ${board.name}` : `in ${place.name}`} that was active before you opened this feed will show as read. Topics with activity since then stay unread.`}
          onConfirm={() => actions.markAllRead(place, feed.asOf ?? new Date().toISOString(), filters.board)}
        />
      ) : null}
    </FeedFrame>
  );
}
