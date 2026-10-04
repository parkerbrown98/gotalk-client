import { Button, Icon, Stack, Text, useTheme } from '@gotalk/ui';
import { Redirect, router } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { InstanceIcon } from '@/components/instance-summary';
import { ScreenFrame } from '@/components/screen-frame';
import { useActiveInstance } from '@/lib/instances';
import { useWide } from '@/lib/layout';
import { useMyPlaces } from '@/lib/places';

/** Phones: the places tab. Wide screens open the first place instead, or Discover when there are none. */
export default function Home() {
  const theme = useTheme();
  const c = theme.colors;
  const wide = useWide();
  const active = useActiveInstance();
  const places = useMyPlaces();
  if (!active) return null;

  if (wide) {
    if (places.isPending) return <ActivityIndicator style={{ flex: 1 }} />;
    const first = places.data?.[0];
    return first ? <Redirect href={{ pathname: '/places/[slug]', params: { slug: first.slug } }} /> : <Redirect href="/discover" />;
  }

  const list = places.data ?? [];
  return (
    <ScreenFrame
      title="Places"
      end={
        <Pressable accessibilityRole="button" accessibilityLabel="Create a place" hitSlop={12} onPress={() => router.push('/places/new')}>
          <Icon name="plus" size={20} color={c.onDark} />
        </Pressable>
      }
      contentStyle={{ padding: theme.space.sm }}
    >
      {places.isPending ? (
        <ActivityIndicator />
      ) : (
        <Stack gap="none">
          {list.length === 0 ? (
            <Stack gap="md" style={{ padding: theme.space.lg }}>
              <Text variant="headingSm">You haven't joined any places yet</Text>
              <Text variant="bodySm" tone="muted">
                Places hold forums, chat and voice for a community. Find one to join, or start your own.
              </Text>
              <Button title="Discover places" onPress={() => router.push('/discover')} />
              <Button title="Create a place" variant="tertiary" onPress={() => router.push('/places/new')} />
            </Stack>
          ) : null}
          {list.map((p) => (
            <Pressable
              key={p.id}
              accessibilityRole="link"
              onPress={() => router.push({ pathname: '/places/[slug]', params: { slug: p.slug } })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md, paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md }}
            >
              <InstanceIcon name={p.name} iconUrl={p.icon_url} origin={active.origin} size={48} />
              <View style={{ flex: 1 }}>
                <Text variant="bodySmStrong" tone="onDark" numberOfLines={1}>
                  {p.name}
                </Text>
                <Text variant="captionMd" tone="muted" numberOfLines={1}>
                  {p.description || `${p.member_count.toLocaleString()} ${p.member_count === 1 ? 'member' : 'members'}`}
                </Text>
              </View>
            </Pressable>
          ))}
          {list.length > 0 ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push('/discover')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md, paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md, marginTop: theme.space.sm }}
            >
              <View style={{ width: 48, height: 48, borderRadius: theme.radii.md, borderWidth: 1, borderStyle: 'dashed', borderColor: c.hairlineStrong, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="compass" size={20} color={c.mute} />
              </View>
              <Text variant="bodySmStrong" tone="onDark" style={{ flex: 1 }}>
                Discover places
              </Text>
              <Icon name="chevronRight" size={16} color={c.mute} />
            </Pressable>
          ) : null}
        </Stack>
      )}
    </ScreenFrame>
  );
}
