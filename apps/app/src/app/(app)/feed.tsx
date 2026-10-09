import { activeFilterCount, availableSorts, feedParams, parseFeedParams, type FeedFilters, type FeedScope, type FeedTopic } from '@gotalk/core';
import { Button, Icon, Notice, PillTabs, Stack, Text, useTheme } from '@gotalk/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ActiveFilters, FeedCard, FeedFrame, FeedItemMenu, FeedList, FiltersDialog, MarkAllDialog, SortBar, useVoteMode } from '@/components/feed';
import { useFeedActions, useFeedCapabilities, useInstanceFeed, useSortPreference } from '@/lib/feeds';
import { useActiveInstance } from '@/lib/instances';
import { useWide } from '@/lib/layout';
import { useMyPlaces } from '@/lib/places';

/** Home: topics from the places the person joined, or every public topic on the instance. */
export default function HomeFeed() {
  const theme = useTheme();
  const c = theme.colors;
  const wide = useWide();
  const params = useLocalSearchParams<Record<string, string>>();
  const active = useActiveInstance();
  const scope: FeedScope = params.scope === 'all' ? 'all' : 'home';
  const caps = useFeedCapabilities();
  const prefs = useSortPreference(scope);
  const voteMode = useVoteMode();
  const actions = useFeedActions();
  const places = useMyPlaces();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [markAll, setMarkAll] = useState(false);
  const [menuItem, setMenuItem] = useState<FeedTopic | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const sorts = availableSorts(caps.sorts, caps.votes);
  const parsed = useMemo(() => parseFeedParams(params, prefs.pref), [params, prefs.pref]);
  const filters: FeedFilters = { ...(sorts.includes(parsed.sort) ? parsed : { ...parsed, sort: 'hot', window: undefined }), board: undefined, pinnedFirst: false };
  const feed = useInstanceFeed(scope, filters, prefs.loaded);
  const unread = [...feed.pinned, ...feed.items].filter((t) => t.viewer && (!t.viewer.read || t.viewer.has_new_replies));

  const change = (next: FeedFilters) => {
    router.setParams({ ...feedParams(next), scope: scope === 'all' ? 'all' : undefined });
    if (next.sort !== filters.sort || next.window !== filters.window) prefs.remember({ sort: next.sort, window: next.window });
  };
  const switchScope = (next: FeedScope) => router.setParams({ scope: next === 'all' ? 'all' : undefined, sort: undefined, t: undefined });

  const scopes = <PillTabs options={[{ value: 'home', label: 'Your places' }, { value: 'all', label: `All of ${active?.name ?? 'this instance'}` }]} value={scope} onChange={switchScope} />;
  const markAllButton = unread.length > 0 ? <Button title="Mark all as read" variant="tertiary" size="sm" onPress={() => setMarkAll(true)} /> : null;
  const header = (
    <View>
      {wide ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md, paddingHorizontal: 16, height: 52, borderBottomWidth: 1, borderBottomColor: c.hairline }}>
          <Icon name="arrowUp" size={16} color={c.mute} />
          <Text variant="bodyStrong" tone="onDark" accessibilityRole="header">
            Home
          </Text>
          {scopes}
          <View style={{ flex: 1 }} />
          {markAllButton}
          <Button title="Search" variant="tertiary" size="sm" onPress={() => router.push('/search')} />
        </View>
      ) : (
        <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>{scopes}</View>
      )}
      <SortBar sorts={sorts} filters={filters} onChange={change} onFilters={() => setFiltersOpen(true)} trailing={wide ? null : markAllButton} />
      <ActiveFilters filters={filters} onChange={change} />
      {problem ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <Notice tone="danger">{problem}</Notice>
        </View>
      ) : null}
    </View>
  );

  const noPlaces = scope === 'home' && places.isSuccess && places.data.length === 0;
  const empty = noPlaces ? (
    <Stack gap="md" align="center">
      <Text variant="bodySmStrong" tone="onDark">
        Nothing to show yet
      </Text>
      <Text variant="bodySm" tone="muted" style={{ textAlign: 'center' }}>
        Join a few places and their topics land here.
      </Text>
      <Button title="Discover places" variant="tertiary" onPress={() => router.push('/discover')} />
    </Stack>
  ) : activeFilterCount(filters) ? (
    filters.hideRead ? (
      'You have read everything that matches. New replies bring topics back.'
    ) : (
      'No topics match these filters.'
    )
  ) : scope === 'home' ? (
    'No topics in your places yet, or you muted them.'
  ) : (
    'No public topics yet.'
  );

  return (
    <FeedFrame
      title="Home"
      end={
        <Pressable accessibilityRole="button" accessibilityLabel="Search your places" hitSlop={12} onPress={() => router.push('/search')}>
          <Icon name="search" size={20} color={c.onDark} />
        </Pressable>
      }
    >
      <FeedList
        feed={feed}
        header={header}
        empty={empty}
        renderCard={(item) => (
          <FeedCard
            item={item}
            wide={wide}
            showPlace
            vote={voteMode(item)}
            onOpen={() => router.push({ pathname: '/places/[slug]/topics/[id]', params: { slug: item.place.slug, id: item.id } })}
            onMenu={() => setMenuItem(item)}
          />
        )}
      />
      <FiltersDialog visible={filtersOpen} onClose={() => setFiltersOpen(false)} filters={filters} onChange={change} canHideRead showPinned={false} />
      <FeedItemMenu item={menuItem} visible={!!menuItem} onClose={() => setMenuItem(null)} onError={setProblem} />
      <MarkAllDialog
        visible={markAll}
        onClose={() => setMarkAll(false)}
        description={`The ${unread.length} unread ${unread.length === 1 ? 'topic' : 'topics'} loaded here will show as read. Topics further down, and new ones, stay as they are.`}
        onConfirm={() => actions.markTopicsRead(unread.map((t) => t.id), caps.readBatch)}
      />
    </FeedFrame>
  );
}
