import { unwrap } from '@gotalk/api-client';
import { Notice, Stack, Text } from '@gotalk/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator } from 'react-native';

import { Markdown } from '@/components/markdown';
import { ScreenFrame } from '@/components/screen-frame';
import { useApiClient } from '@/lib/api';
import { useActiveInstance } from '@/lib/instances';
import { goBack } from '@/lib/layout';

const KINDS = ['terms', 'privacy', 'guidelines'] as const;
type Kind = (typeof KINDS)[number];

export default function PolicyScreen() {
  const { kind } = useLocalSearchParams<{ kind: string }>();
  const active = useActiveInstance();
  const client = useApiClient();
  const valid = (KINDS as readonly string[]).includes(kind ?? '');
  const policy = useQuery({
    queryKey: ['policy', active?.id, kind],
    enabled: !!client && valid,
    queryFn: async () => unwrap(await client!.GET('/policies/{kind}', { params: { path: { kind: kind as Kind } } })),
  });

  return (
    <ScreenFrame title={policy.data?.title ?? 'Policy'} onBack={() => goBack('/home')} maxWidth={720}>
      {!valid || policy.isError ? (
        <Notice tone="danger">This policy could not be loaded.</Notice>
      ) : policy.data ? (
        <Stack gap="lg">
          <Stack gap="xs">
            <Text variant="headingXl" accessibilityRole="header">
              {policy.data.title}
            </Text>
            <Text variant="captionMd" tone="muted">
              Version {policy.data.version} · effective {new Date(policy.data.effective_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
            </Text>
          </Stack>
          <Markdown source={policy.data.content} />
        </Stack>
      ) : (
        <ActivityIndicator />
      )}
    </ScreenFrame>
  );
}
