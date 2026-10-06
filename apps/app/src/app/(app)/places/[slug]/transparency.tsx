import { Text, useTheme } from '@gotalk/ui';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ScreenFrame } from '@/components/screen-frame';
import { TransparencyReport } from '@/components/transparency-report';
import { goBack, useWide } from '@/lib/layout';
import { usePlace } from '@/lib/places';

export default function PlaceTransparency() {
  const theme = useTheme();
  const wide = useWide();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const place = usePlace(slug).data;
  const [days, setDays] = useState<'30' | '90' | '365'>('30');
  return (
    <ScreenFrame title="Transparency report" onBack={() => goBack({ pathname: '/places/[slug]', params: { slug } })} maxWidth={880} contentStyle={wide ? { paddingVertical: 32, paddingHorizontal: 40 } : { paddingVertical: theme.space.lg }}>
      {wide ? (
        <View style={{ marginBottom: theme.space.lg }}>
          <Text variant="headingLg" accessibilityRole="header">
            Transparency report
          </Text>
        </View>
      ) : null}
      <TransparencyReport
        place={slug}
        description={`How ${place?.name ?? 'this place'} was moderated. Anyone who can see the place can read this.`}
        days={days}
        onDaysChange={setDays}
      />
    </ScreenFrame>
  );
}
