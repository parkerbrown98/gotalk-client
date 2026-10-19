import { ApiError } from '@gotalk/api-client';
import { availableSorts, feedParams, isValidSlug, parseFeedParams, type FeedFilters } from '@gotalk/core';
import { Button, Notice, Stack, Text, useTheme } from '@gotalk/ui';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { ActiveFilters, FeedCard, FeedFrame, FeedList, FiltersDialog, SortBar, useVoteMode } from '@/components/feed';
import { InstanceIcon } from '@/components/instance-summary';
import { IncompleteLink, LinkLanding } from '@/components/link-landing';
import { ScreenFrame } from '@/components/screen-frame';
import { IndexedIndicator } from '@/components/search-index';
import { useSession } from '@/lib/auth';
import { useFeedCapabilities, useLocalReads, usePlaceFeed, useSortPreference } from '@/lib/feeds';
import { instancesStore, useActiveInstance } from '@/lib/instances';
import { goBack, useWide } from '@/lib/layout';
import { useLinkStep } from '@/lib/links';
import { pendingLink } from '@/lib/pending-invite';
import { usePlace } from '@/lib/places';
import { welcomeHref, type AccountTab } from '@/lib/welcome';

/**
 * A public place's topics, read-only, for people who have not signed in. Place links
 * (`/places/<slug>?instance=<origin>`) come here unless their instance is already open: with `instance`, this
 * switches to it (opening the place when signed in there), or offers to add it first.
 */
export default function ExplorePlace() {
  const { slug, instance } = useLocalSearchParams<{ slug: string; instance?: string }>();
  const active = useActiveInstance();
  const step = useLinkStep(instance);
  const switchTo = instance && (step.kind === 'open' || step.kind === 'read') && active?.id !== step.instanceId ? step.instanceId : null;

  useEffect(() => {
    if (switchTo) instancesStore.getState().setActive(switchTo);
  }, [switchTo]);

  if (!instance) return <PublicPlace />;
  const target = { kind: 'place', slug: slug ?? '' } as const;
  if (step.kind === 'incomplete' || !isValidSlug(target.slug)) return <IncompleteLink target={target} />;
  if (step.kind === 'offer') return <LinkLanding target={target} origin={step.origin} />;
  if (switchTo) return <ActivityIndicator style={{ flex: 1 }} />;
  if (step.kind === 'open') return <Redirect href={{ pathname: '/places/[slug]', params: { slug: target.slug } }} />;
  return <Redirect href={{ pathname: '/explore/places/[slug]', params: { slug: target.slug } }} />;
}

function PublicPlace() {
  const theme = useTheme();
  const c = theme.colors;
  const wide = useWide();
  const params = useLocalSearchParams<Record<string, string>>();
  const slug = params.slug!;
  const active = useActiveInstance();
  const session = useSession();
  const placeQuery = usePlace(slug);
  const place = placeQuery.data;
  const caps = useFeedCapabilities();
  const prefs = useSortPreference('place');
  const voteMode = useVoteMode();
  const localReads = useLocalReads();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const readable = place?.visibility === 'public';
  const sorts = availableSorts(caps.sorts, caps.votes && (place?.voting_enabled ?? false));
  const parsed = useMemo(() => parseFeedParams(params, prefs.pref), [params, prefs.pref]);
  const filters: FeedFilters = { ...(sorts.includes(parsed.sort) ? parsed : { ...parsed, sort: 'hot', window: undefined }), board: undefined, hideRead: false };
  const feed = usePlaceFeed(place?.slug, filters, !session && readable && prefs.loaded);

  if (!active) return <Redirect href="/welcome" />;
  if (session) return <Redirect href={{ pathname: '/places/[slug]', params: { slug } }} />;

  // Signing in from here carries on to this place.
  const account = (tab: AccountTab) => {
    pendingLink.set({ kind: 'place', slug: place?.slug ?? slug, origin: active.origin });
    router.push(welcomeHref(active.origin, tab));
  };
  const back = () => goBack('/explore');
  const host = active.origin.replace(/^https?:\/\//, '');

  if (placeQuery.isPending) return <ActivityIndicator style={{ flex: 1 }} />;
  if (!place) {
    const gone = placeQuery.error instanceof ApiError && placeQuery.error.status < 500;
    return (
      <ScreenFrame title="Place" onBack={back}>
        <Stack gap="lg">
          <Notice tone="danger" title={gone ? 'This place is private or does not exist.' : 'The place could not be loaded.'}>
            {gone ? `Sign in to ${host} to see places you belong to.` : 'Check your connection and try again.'}
          </Notice>
          <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
            <Button title="Sign in" onPress={() => account('sign-in')} />
            <Button title="Browse public topics" variant="tertiary" onPress={() => router.replace('/explore')} />
          </View>
        </Stack>
      </ScreenFrame>
    );
  }

  const change = (next: FeedFilters) => {
    router.setParams(feedParams(next));
    if (next.sort !== filters.sort || next.window !== filters.window) prefs.remember({ sort: next.sort, window: next.window });
  };

  const header = (
    <View>
      <Stack gap="md" style={{ paddingHorizontal: 16, paddingTop: wide ? theme.space.xl : theme.space.lg, paddingBottom: theme.space.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: wide ? theme.space.lg : theme.space.md }}>
          <InstanceIcon name={place.name} iconUrl={place.icon_url} origin={active.origin} size={wide ? 56 : 48} />
          <Stack gap="xxs" style={{ flex: 1 }}>
            <Text variant={wide ? 'headingLg' : 'headingSm'} accessibilityRole="header">
              {place.name}
            </Text>
            <Text variant="captionMd" tone="muted">
              {`${host} · ${place.member_count.toLocaleString()} ${place.member_count === 1 ? 'member' : 'members'}`}
            </Text>
            {place.indexed ? <IndexedIndicator /> : null}
          </Stack>
          {wide ? (
            <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
              <Button title="Create an account" variant="secondary" size="sm" onPress={() => account('create')} />
              <Button title="Sign in to join" size="sm" onPress={() => account('sign-in')} />
            </View>
          ) : null}
        </View>
        {place.description ? (
          <Text variant="bodySm" tone="muted">
            {place.description}
          </Text>
        ) : null}
        {wide ? null : <Button title="Sign in to join" onPress={() => account('sign-in')} />}
        {readable ? null : (
          <Notice tone="warning" title="This place is by invitation.">
            Sign in and ask a member for an invite link to see it.
          </Notice>
        )}
      </Stack>
      {readable ? (
        <>
          <SortBar sorts={sorts} filters={filters} onChange={change} onFilters={() => setFiltersOpen(true)} />
          <ActiveFilters filters={filters} onChange={change} />
        </>
      ) : null}
    </View>
  );

  return (
    <FeedFrame
      title={place.name}
      onBack={back}
      end={
        <Pressable accessibilityRole="link" hitSlop={12} onPress={() => account('sign-in')}>
          <Text variant="bodySmStrong" tone="onDark">
            Sign in
          </Text>
        </Pressable>
      }
    >
      {readable ? (
        <FeedList
          feed={feed}
          header={header}
          empty="No public topics here yet."
          renderCard={(item) => (
            <FeedCard
              item={item}
              wide={wide}
              showPlace={false}
              vote={voteMode(item)}
              locallyRead={localReads.has(item.id)}
              onOpen={() => router.push({ pathname: '/explore/topics/[id]', params: { id: item.id } })}
            />
          )}
        />
      ) : (
        header
      )}
      <View style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.hairline, alignItems: 'center' }}>
        <Text variant="captionMd" tone="muted">
          Topics you open are remembered on this device until you sign in.
        </Text>
      </View>
      <FiltersDialog visible={filtersOpen} onClose={() => setFiltersOpen(false)} filters={filters} onChange={change} canHideRead={false} showPinned />
    </FeedFrame>
  );
}
