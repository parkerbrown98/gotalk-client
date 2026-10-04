import { Notice, Stack, Text } from '@gotalk/ui';
import { useLocalSearchParams } from 'expo-router';

import { ScreenFrame } from '@/components/screen-frame';
import { goBack } from '@/lib/layout';
import { useChannels } from '@/lib/places';

/** Messages arrive with chat; until then the channel is listed but empty. */
export default function Channel() {
  const { slug, id } = useLocalSearchParams<{ slug: string; id: string }>();
  const channel = useChannels(slug).data?.find((c) => c.id === id);
  const voice = channel?.kind === 'voice';
  return (
    <ScreenFrame title={channel?.name ?? 'Channel'} onBack={() => goBack({ pathname: '/places/[slug]', params: { slug } })}>
      <Stack gap="lg">
        <Text variant="headingXl" accessibilityRole="header">
          {channel?.name ?? 'Channel'}
        </Text>
        <Notice tone="info" title={voice ? 'Voice is coming soon.' : 'Messages are coming soon.'}>
          {voice ? 'You will join calls from here once voice opens in this client.' : 'You will read and send messages here once chat opens in this client.'}
        </Notice>
      </Stack>
    </ScreenFrame>
  );
}
