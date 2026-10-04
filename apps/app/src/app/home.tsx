import { Avatar, Button, Card, Screen, Stack, Text } from '@gotalk/ui';
import { Redirect, router, Stack as RouterStack } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView } from 'react-native';

import { InstanceIcon, InstanceSummary } from '@/components/instance-summary';
import { useConsents, useInstanceInfo, useMe } from '@/lib/api';
import { forgetInstance, useSession } from '@/lib/auth';
import { consentDismissed } from '@/lib/consent';
import { instancesStore, useActiveInstance, useInstances } from '@/lib/instances';
import { resetTo } from '@/lib/layout';

export default function Home() {
  const active = useActiveInstance();
  const session = useSession();
  const instances = useInstances((s) => s.instances);
  const others = instances.filter((i) => i.id !== active?.id);
  const info = useInstanceInfo();
  const me = useMe();
  const consents = useConsents();
  const owesConsent = (consents.data?.outstanding?.length ?? 0) > 0;

  useEffect(() => {
    if (active && owesConsent && !consentDismissed.has(active.id)) router.push('/consent');
  }, [active, owesConsent]);

  if (!active) return <Redirect href="/connect" />;
  if (!session) return <Redirect href="/sign-in" />;

  const user = me.data;
  return (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1 }}
      refreshControl={
        <RefreshControl
          refreshing={info.isRefetching}
          onRefresh={() => {
            void info.refetch();
            void me.refetch();
          }}
        />
      }
    >
      <RouterStack.Screen options={{ title: active.name }} />
      <Screen>
        <Stack gap="xl">
          <Card>
            <Stack direction="row" gap="md" align="center">
              <Avatar name={user?.display_name ?? session.displayName} uri={user?.avatar_url ?? session.avatarUrl} size={48} />
              <Stack gap="none" style={{ flex: 1 }}>
                <Text variant="headingSm">{user?.display_name ?? session.displayName}</Text>
                <Text variant="captionMd" tone="muted">
                  @{session.username}
                </Text>
              </Stack>
              <Button title="Account" variant="tertiary" onPress={() => router.push('/settings')} />
            </Stack>
          </Card>

          <Card>
            {info.data ? (
              <InstanceSummary instance={info.data} origin={active.origin} secure={active.apiBaseUrl.startsWith('https://')} />
            ) : info.isError ? (
              <Stack gap="sm">
                <Text variant="headingSm">{active.name}</Text>
                <Text tone="danger">
                  Couldn't reach {active.origin}. {info.error.message}
                </Text>
                <Button title="Retry" variant="tertiary" onPress={() => info.refetch()} />
              </Stack>
            ) : (
              <ActivityIndicator />
            )}
          </Card>

          <Card>
            <Text variant="headingSm">You're signed in</Text>
            <Text tone="muted">Places, forums and chat arrive in the next phases of the client.</Text>
          </Card>

          <Stack gap="md">
            {others.length > 0 ? (
              <Text variant="bodySmStrong" tone="muted">
                Other instances
              </Text>
            ) : null}
            {others.map((i) => (
              <Card compact key={i.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <InstanceIcon name={i.name} iconUrl={i.iconUrl} origin={i.origin} size={36} />
                <Stack gap="none" style={{ flex: 1 }}>
                  <Text variant="bodySmStrong" tone="onDark">
                    {i.name}
                  </Text>
                  <Text variant="captionMd" tone="muted">
                    {i.origin.replace(/^https?:\/\//, '')}
                  </Text>
                </Stack>
                <Button title="Switch" variant="tertiary" onPress={() => instancesStore.getState().setActive(i.id)} />
              </Card>
            ))}
            <Button title="Add an instance" variant="tertiary" onPress={() => router.push('/connect')} />
            <Button
              title={`Forget ${active.name}`}
              variant="danger"
              onPress={async () => {
                await forgetInstance(active.id);
                resetTo('/connect');
              }}
            />
          </Stack>
        </Stack>
      </Screen>
    </ScrollView>
  );
}
