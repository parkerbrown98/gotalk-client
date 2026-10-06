import { useTheme } from '@gotalk/ui';
import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { PlaceSettingsNav, usePlaceSettings } from '@/components/place-settings';
import { useWide } from '@/lib/layout';

/** Place settings: a section nav beside the open section on wide screens, pushed screens on phones. */
export default function PlaceSettingsLayout() {
  const theme = useTheme();
  const wide = useWide();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { place, sections, loading } = usePlaceSettings(slug);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;
  if (!place || sections.length === 0) return <Redirect href={{ pathname: '/places/[slug]', params: { slug } }} />;

  const screens = <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.canvas }, animation: wide ? 'none' : 'default' }} />;
  if (!wide) return screens;
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: theme.colors.canvas }}>
      <PlaceSettingsNav slug={place.slug} />
      <View style={{ flex: 1 }}>{screens}</View>
    </View>
  );
}
