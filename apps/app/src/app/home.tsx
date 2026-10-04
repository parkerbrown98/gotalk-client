import { Button, Card, Screen, Stack, Text } from '@gotalk/ui';
import { Redirect, router, Stack as RouterStack } from 'expo-router';
import { ActivityIndicator, RefreshControl, ScrollView } from 'react-native';

import { InstanceIcon, InstanceSummary } from '@/components/instance-summary';
import { useInstanceInfo } from '@/lib/api';
import { instancesStore, useActiveInstance, useInstances } from '@/lib/instances';

export default function Home() {
  const active = useActiveInstance();
  const instances = useInstances((s) => s.instances);
  const others = instances.filter((i) => i.id !== active?.id);
  const info = useInstanceInfo();

  if (!active) return <Redirect href="/connect" />;

  return (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={info.isRefetching} onRefresh={() => info.refetch()} />}
    >
      <RouterStack.Screen options={{ title: active.name }} />
      <Screen>
        <Stack gap={5}>
          <Card>
            {info.data ? (
              <InstanceSummary instance={info.data} origin={active.origin} secure={active.apiBaseUrl.startsWith('https://')} />
            ) : info.isError ? (
              <Stack gap={2}>
                <Text variant="heading">{active.name}</Text>
                <Text tone="danger">Couldn't reach {active.origin}. {info.error.message}</Text>
                <Button title="Retry" variant="secondary" onPress={() => info.refetch()} />
              </Stack>
            ) : (
              <ActivityIndicator />
            )}
          </Card>

          <Card>
            <Text variant="heading">Sign in</Text>
            <Text tone="muted">Accounts, places, forums and chat arrive in the next phases of the client.</Text>
          </Card>

          <Stack gap={3}>
            {others.length > 0 ? (
              <Text variant="label" tone="muted">
                Other instances
              </Text>
            ) : null}
            {others.map((i) => (
              <Card key={i.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <InstanceIcon name={i.name} iconUrl={i.iconUrl} origin={i.origin} size={36} />
                <Stack gap={0} style={{ flex: 1 }}>
                  <Text variant="label">{i.name}</Text>
                  <Text variant="caption" tone="muted">
                    {i.origin.replace(/^https?:\/\//, '')}
                  </Text>
                </Stack>
                <Button title="Switch" variant="secondary" onPress={() => instancesStore.getState().setActive(i.id)} />
              </Card>
            ))}
            <Button title="Add an instance" variant="secondary" onPress={() => router.push('/connect')} />
            <Button
              title={`Forget ${active.name}`}
              variant="danger"
              onPress={() => {
                instancesStore.getState().removeInstance(active.id);
                router.replace('/connect');
              }}
            />
          </Stack>
        </Stack>
      </Screen>
    </ScrollView>
  );
}
