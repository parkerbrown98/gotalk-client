import { Text, useTheme } from '@gotalk/ui';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { ScreenFrame } from '@/components/screen-frame';
import { SearchView } from '@/components/search-view';
import { goBack, useWide } from '@/lib/layout';
import { usePlace } from '@/lib/places';

/** Search inside one place, optionally limited to one forum (`board` is its ID). */
export default function PlaceSearch() {
  const theme = useTheme();
  const wide = useWide();
  const { slug, board } = useLocalSearchParams<{ slug: string; board?: string }>();
  const place = usePlace(slug).data;
  return (
    <ScreenFrame title="Search" onBack={() => goBack({ pathname: '/places/[slug]', params: { slug } })} maxWidth={880} contentStyle={wide ? { paddingVertical: 32, paddingHorizontal: 40 } : { paddingVertical: theme.space.lg }}>
      {wide ? (
        <View style={{ marginBottom: theme.space.lg }}>
          <Text variant="headingLg" accessibilityRole="header">
            Search {place?.name ?? ''}
          </Text>
        </View>
      ) : null}
      <SearchView slug={slug} board={board || undefined} />
    </ScreenFrame>
  );
}
