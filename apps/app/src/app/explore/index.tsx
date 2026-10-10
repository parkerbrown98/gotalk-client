import { availableSorts, feedParams, instanceDisplayName, parseFeedParams, type FeedFilters } from '@gotalk/core';
import { Button, Text, useTheme } from '@gotalk/ui';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ActiveFilters, FeedCard, FeedFrame, FeedList, FiltersDialog, SortBar, useVoteMode } from '@/components/feed';
import { ServerIcon } from '@/components/instance-summary';
import { useSession } from '@/lib/auth';
import { useFeedCapabilities, useInstanceFeed, useLocalReads, useSortPreference } from '@/lib/feeds';
import { useActiveInstance } from '@/lib/instances';
import { useWide } from '@/lib/layout';
import { welcomeHref } from '@/lib/welcome';

/** Public topics on the instance, for people who have not signed in. */
export default function Explore() {
  const theme = useTheme();
  const c = theme.colors;
  const wide = useWide();
  const params = useLocalSearchParams<Record<string, string>>();
  const active = useActiveInstance();
  const session = useSession();
  const caps = useFeedCapabilities();
  const prefs = useSortPreference('explore');
  const voteMode = useVoteMode();
  const localReads = useLocalReads();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const sorts = availableSorts(caps.sorts, caps.votes);
  const parsed = useMemo(() => parseFeedParams(params, prefs.pref), [params, prefs.pref]);
  const filters: FeedFilters = { ...(sorts.includes(parsed.sort) ? parsed : { ...parsed, sort: 'hot', window: undefined }), board: undefined, pinnedFirst: false, hideRead: false };
  const feed = useInstanceFeed('all', filters, !session && prefs.loaded);

  if (!active) return <Redirect href="/welcome" />;
  if (session) return <Redirect href={{ pathname: '/feed', params: { scope: 'all' } }} />;

  const change = (next: FeedFilters) => {
    router.setParams(feedParams(next));
    if (next.sort !== filters.sort || next.window !== filters.window) prefs.remember({ sort: next.sort, window: next.window });
  };

  const header = (
    <View>
      {wide ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md, paddingHorizontal: 16, height: 56, borderBottomWidth: 1, borderBottomColor: c.hairline }}>
          <ServerIcon name={active.name} iconUrl={active.iconUrl} origin={active.origin} size={32} />
          <Text variant="bodyStrong" tone="onDark" accessibilityRole="header">
            {instanceDisplayName(active.origin, active.name)}
          </Text>
          <Text variant="captionMd" tone="muted" style={{ flex: 1 }}>
            Public topics
          </Text>
          <Button title="Create an account" variant="secondary" size="sm" onPress={() => router.push(welcomeHref(active.origin, 'create'))} />
          <Button title="Sign in" size="sm" onPress={() => router.push(welcomeHref(active.origin))} />
        </View>
      ) : null}
      <SortBar sorts={sorts} filters={filters} onChange={change} onFilters={() => setFiltersOpen(true)} />
      <ActiveFilters filters={filters} onChange={change} />
    </View>
  );

  return (
    <FeedFrame
      title="Explore"
      onBack={() => router.replace(welcomeHref(active.origin))}
      end={
        <Pressable accessibilityRole="link" hitSlop={12} onPress={() => router.push(welcomeHref(active.origin))}>
          <Text variant="bodySmStrong" tone="onDark">
            Sign in
          </Text>
        </Pressable>
      }
    >
      <FeedList
        feed={feed}
        header={header}
        empty="No public topics yet."
        renderCard={(item) => (
          <FeedCard
            item={item}
            wide={wide}
            showPlace
            vote={voteMode(item)}
            locallyRead={localReads.has(item.id)}
            onOpen={() => router.push({ pathname: '/explore/topics/[id]', params: { id: item.id } })}
          />
        )}
      />
      <View style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.hairline, alignItems: 'center' }}>
        <Text variant="captionMd" tone="muted">
          Topics you open are remembered on this device until you sign in.
        </Text>
      </View>
      <FiltersDialog visible={filtersOpen} onClose={() => setFiltersOpen(false)} filters={filters} onChange={change} canHideRead={false} showPinned={false} />
    </FeedFrame>
  );
}
