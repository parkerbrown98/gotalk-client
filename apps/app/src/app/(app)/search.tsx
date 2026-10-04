import { Notice, PillTabs, Stack, Text, useTheme } from '@gotalk/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { ScreenFrame } from '@/components/screen-frame';
import { SearchView } from '@/components/search-view';
import { useMyPlaces } from '@/lib/places';

/** The phone Search tab: pick one of the joined places, then search it. */
export default function SearchTab() {
  const theme = useTheme();
  const places = useMyPlaces().data ?? [];
  const [chosen, setChosen] = useState<string | null>(null);
  const slug = chosen && places.some((p) => p.slug === chosen) ? chosen : places[0]?.slug;
  return (
    <ScreenFrame title="Search" contentStyle={{ paddingVertical: theme.space.lg }}>
      {!slug ? (
        <View style={{ paddingHorizontal: theme.space.lg }}>
          <Notice tone="info" title="Join a place to search it.">
            Search covers one place at a time.
          </Notice>
        </View>
      ) : (
        <Stack gap="md">
          {places.length > 1 ? (
            <View style={{ paddingHorizontal: theme.space.lg, gap: theme.space.xs }}>
              <Text variant="captionMd" tone="muted">
                Place
              </Text>
              <PillTabs options={places.map((p) => ({ value: p.slug, label: p.name }))} value={slug} onChange={setChosen} />
            </View>
          ) : null}
          <SearchView key={slug} slug={slug} />
        </Stack>
      )}
    </ScreenFrame>
  );
}
