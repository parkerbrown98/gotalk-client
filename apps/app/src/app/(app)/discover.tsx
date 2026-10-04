import { Badge, Button, Card, Notice, PillTabs, Stack, Text, TextField, useTheme } from '@gotalk/ui';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { FailureNotice } from '@/components/failure-notice';
import { InstanceIcon } from '@/components/instance-summary';
import { ScreenFrame } from '@/components/screen-frame';
import { classifyFailure, type FailureKind } from '@/lib/failure';
import { useActiveInstance } from '@/lib/instances';
import { useWide } from '@/lib/layout';
import { useDiscover, useMyPlaces, usePlaceActions, type Place } from '@/lib/places';

type Filter = 'all' | 'open';
const FILTERS = [
  { value: 'all', label: 'All places' },
  { value: 'open', label: 'Open to join' },
] as const;

export default function Discover() {
  const theme = useTheme();
  const wide = useWide();
  const active = useActiveInstance();
  const actions = usePlaceActions();
  const mine = useMyPlaces().data ?? [];
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [joining, setJoining] = useState<string | null>(null);
  const [failure, setFailure] = useState<FailureKind | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(text), 250);
    return () => clearTimeout(timer);
  }, [text]);

  const discover = useDiscover(query);
  if (!active) return null;

  const joined = new Set(mine.map((p) => p.id));
  const places = (discover.data?.pages.flatMap((p) => p.items ?? []) ?? []).filter((p) => filter === 'all' || p.visibility === 'public');
  // One white button, on the best match for what was typed, and only when searching.
  const best = query.trim() ? places.find((p) => !joined.has(p.id) && p.visibility === 'public') : undefined;
  const columns = wide ? 3 : 1;

  async function join(place: Place) {
    setJoining(place.id);
    setJoinError(null);
    try {
      await actions.join(place.slug);
      router.push({ pathname: '/places/[slug]', params: { slug: place.slug } });
    } catch (e) {
      const f = classifyFailure(e);
      setJoinError(f.kind === 'rejected' ? f.message : 'Could not join the place. Try again.');
      setFailure(f.kind === 'rejected' ? null : f);
    } finally {
      setJoining(null);
    }
  }

  return (
    <ScreenFrame title="Discover places" maxWidth={1080} contentStyle={wide ? { paddingVertical: theme.space.xl, paddingHorizontal: 40, gap: theme.space.lg } : { padding: theme.space.lg, gap: theme.space.lg }}>
      {wide ? (
        <Text variant="headingXl" accessibilityRole="header">
          Discover places
        </Text>
      ) : null}
      <TextField
        value={text}
        onChangeText={setText}
        placeholder="Search places"
        accessibilityLabel="Search places"
        style={{ minHeight: theme.sizes.searchHeight, paddingHorizontal: theme.space.lg }}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
      <PillTabs options={FILTERS} value={filter} onChange={setFilter} />
      <FailureNotice failure={failure ?? (discover.isError ? classifyFailure(discover.error) : null)} host={active.origin.replace(/^https?:\/\//, '')} />
      {joinError ? <Notice tone="danger">{joinError}</Notice> : null}

      {discover.isPending ? <ActivityIndicator /> : null}
      {discover.isSuccess && places.length === 0 ? (
        <Text variant="bodySm" tone="muted">
          {query.trim() ? `No places match "${query.trim()}".` : 'No places to discover yet. Create the first one.'}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.lg }}>
        {places.map((p) => {
          const isMember = joined.has(p.id);
          return (
            <View key={p.id} style={{ width: columns === 1 ? '100%' : '31.5%', flexGrow: columns === 1 ? 0 : 1, minWidth: columns === 1 ? undefined : 240 }}>
              <Card compact style={{ flex: 1 }}>
                <Stack direction="row" gap="md" align="center">
                  <InstanceIcon name={p.name} iconUrl={p.icon_url} origin={active.origin} size={48} />
                  <Stack gap="none" style={{ flex: 1 }}>
                    <Text variant="headingSm" numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text variant="captionMd" tone="muted">
                      {p.member_count.toLocaleString()} {p.member_count === 1 ? 'member' : 'members'}
                    </Text>
                  </Stack>
                  {p.visibility === 'invite_only' ? <Badge label="Invite only" tone="warning" /> : null}
                </Stack>
                {p.description ? (
                  <Text variant="bodySm" tone="muted" numberOfLines={3}>
                    {p.description}
                  </Text>
                ) : null}
                <View style={{ flex: 1 }} />
                {isMember ? (
                  <Button title="Open" variant="tertiary" onPress={() => router.push({ pathname: '/places/[slug]', params: { slug: p.slug } })} />
                ) : p.visibility === 'public' ? (
                  <Button title="Join place" variant={best?.id === p.id ? 'primary' : 'tertiary'} loading={joining === p.id} disabled={!!joining} onPress={() => join(p)} />
                ) : (
                  <Button title="Invite only" disabled />
                )}
              </Card>
            </View>
          );
        })}
      </View>
      {discover.hasNextPage ? (
        <Button title="Show more" variant="tertiary" loading={discover.isFetchingNextPage} onPress={() => discover.fetchNextPage()} style={{ alignSelf: 'flex-start' }} />
      ) : null}
    </ScreenFrame>
  );
}
