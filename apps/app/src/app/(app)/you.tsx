import { Avatar, Button, Card, Stack, Text } from '@gotalk/ui';
import { router } from 'expo-router';
import { ActivityIndicator } from 'react-native';

import { InstanceIcon, InstanceSummary } from '@/components/instance-summary';
import { ScreenFrame } from '@/components/screen-frame';
import { useInstanceInfo, useMe } from '@/lib/api';
import { forgetInstance, useSession } from '@/lib/auth';
import { instancesStore, useActiveInstance, useInstances } from '@/lib/instances';
import { resetTo } from '@/lib/layout';

/** The signed-in account and the instances saved on this device. */
export default function You() {
  const active = useActiveInstance();
  const session = useSession();
  const instances = useInstances((s) => s.instances);
  const others = instances.filter((i) => i.id !== active?.id);
  const info = useInstanceInfo();
  const me = useMe().data;
  if (!active || !session) return null;

  return (
    <ScreenFrame title="You">
      <Stack gap="xl">
        <Card>
          <Stack direction="row" gap="md" align="center">
            <Avatar name={me?.display_name ?? session.displayName} uri={me?.avatar_url ?? session.avatarUrl} size={48} />
            <Stack gap="none" style={{ flex: 1 }}>
              <Text variant="headingSm">{me?.display_name ?? session.displayName}</Text>
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
              <Button
                title="Switch"
                variant="tertiary"
                onPress={() => {
                  instancesStore.getState().setActive(i.id);
                  resetTo('/home');
                }}
              />
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
    </ScreenFrame>
  );
}
