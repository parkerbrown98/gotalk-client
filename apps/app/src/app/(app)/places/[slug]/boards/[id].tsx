import { Notice, Stack, Text } from '@gotalk/ui';
import { useLocalSearchParams } from 'expo-router';

import { ScreenFrame } from '@/components/screen-frame';
import { goBack } from '@/lib/layout';
import { useBoards } from '@/lib/places';

/** Reading and posting arrive with forums; until then the board is listed but empty. */
export default function Board() {
  const { slug, id } = useLocalSearchParams<{ slug: string; id: string }>();
  const board = useBoards(slug).data?.find((b) => b.id === id);
  return (
    <ScreenFrame title={board?.name ?? 'Forum'} onBack={() => goBack({ pathname: '/places/[slug]', params: { slug } })}>
      <Stack gap="lg">
        <Text variant="headingXl" accessibilityRole="header">
          {board?.name ?? 'Forum'}
        </Text>
        <Notice tone="info" title="Topics are coming soon.">
          You will read, post and reply here once forums open in this client.
        </Notice>
      </Stack>
    </ScreenFrame>
  );
}
