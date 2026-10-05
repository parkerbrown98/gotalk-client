import { Button, Card, Stack, Text } from '@gotalk/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';

import { InstanceIcon, InstanceSummary } from '@/components/instance-summary';
import { PresenceAvatar, PresenceSheet, presenceLabels } from '@/components/presence';
import { ScreenFrame } from '@/components/screen-frame';
import { useInstanceInfo, useMe } from '@/lib/api';
import { forgetInstance, useSession } from '@/lib/auth';
import { instancesStore, useActiveInstance, useInstances } from '@/lib/instances';
import { resetTo } from '@/lib/layout';
import { useMyStatus } from '@/lib/realtime';

/** The signed-in account and the instances saved on this device. */
export default function You() {
  const active = useActiveInstance();
  const session = useSession();
  const instances = useInstances((s) => s.instances);
  const others = instances.filter((i) => i.id !== active?.id);
  const info = useInstanceInfo();
  const me = useMe().data;
  const status = useMyStatus();
  const [picking, setPicking] = useState(false);
  if (!active || !session) return null;
  const name = me?.display_name ?? session.displayName;

  return (
    <ScreenFrame title="You">
      <Stack gap="xl">
        <Card>
          <Stack direction="row" gap="md" align="center">
            <Pressable accessibilityRole="button" accessibilityLabel={`Status: ${presenceLabels[status]}. Change`} onPress={() => setPicking(true)}>
              <PresenceAvatar user={{ id: session.userId, display_name: name, avatar_url: me?.avatar_url ?? session.avatarUrl }} size={48} />
            </Pressable>
            <Stack gap="none" style={{ flex: 1 }}>
              <Text variant="headingSm">{name}</Text>
              <Text variant="captionMd" tone="muted" onPress={() => setPicking(true)}>
                @{session.username} · {presenceLabels[status]}
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
      <PresenceSheet visible={picking} onClose={() => setPicking(false)} />
    </ScreenFrame>
  );
}
