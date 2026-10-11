import { instanceDisplayName } from '@gotalk/core';
import { Badge, Button, Card, ListCard, ListRow, Notice, Stack, Text } from '@gotalk/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';

import { InstanceSummary, ServerIcon } from '@/components/instance-summary';
import { PresenceAvatar, PresenceSheet, presenceLabels } from '@/components/presence';
import { ScreenFrame } from '@/components/screen-frame';
import { AttentionDot, useSettingsGroups } from '@/components/settings-page';
import { useInstanceInfo, useMe } from '@/lib/api';
import { forgetInstance, signOut, useAuthTarget, useSession } from '@/lib/auth';
import { failureMessage } from '@/lib/failure';
import { instancesStore, useActiveInstance, useInstances } from '@/lib/instances';
import { resetTo, useWide } from '@/lib/layout';
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
  const groups = useSettingsGroups();
  const target = useAuthTarget();
  const wide = useWide();
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!active || !session) return null;
  const name = me?.display_name ?? session.displayName;

  return (
    <ScreenFrame title="You">
      <Stack gap="xl">
        {wide ? <Text variant="headingXl" accessibilityRole="header">You</Text> : null}
        <Card>
          <Stack direction="row" gap="md" align="center">
            <Pressable accessibilityRole="button" accessibilityLabel={`Status: ${presenceLabels[status]}. Change`} onPress={() => setPicking(true)}>
              <PresenceAvatar user={{ id: session.userId, display_name: name, avatar_url: me?.avatar_url ?? session.avatarUrl }} size={48} />
            </Pressable>
            <Stack gap="none" style={{ flex: 1 }}>
              <Text variant="headingSm">{name}</Text>
              <Text variant="captionMd" tone="muted">
                @{session.username}
              </Text>
            </Stack>
            <Button title={presenceLabels[status]} variant="tertiary" size="sm" accessibilityLabel="Change your status" onPress={() => setPicking(true)} />
          </Stack>
          <Text variant="captionMd" tone="muted">Your account on {instanceDisplayName(active.origin, active.name)}</Text>
        </Card>

        {error ? <Notice tone="danger">{error}</Notice> : null}
        {groups.map((g) => (
          <Stack key={g.label} gap="sm">
            <Stack direction="row" gap="xs" align="center">
              <Text variant="bodySmStrong" tone="muted">{g.label}</Text>
              {g.attention ? <AttentionDot /> : null}
            </Stack>
            <ListCard>
              {g.links.map((l) => (
                <ListRow key={l.path} icon={l.icon} title={l.label} tone={l.path === '/settings/delete' ? 'danger' : 'default'} chevron onPress={() => router.push(l.path)} />
              ))}
              {g.label === 'Account' ? (
                <ListRow icon="logout" title={busy ? 'Please wait...' : 'Sign out'} onPress={busy ? undefined : async () => {
                  if (!target) {
                    setError('No active account. Reload and try again.');
                    return;
                  }
                  setBusy(true);
                  setError(null);
                  try {
                    await signOut(target);
                  } catch (e) {
                    setError(failureMessage(e, 'Could not sign out. Try again.'));
                  } finally {
                    setBusy(false);
                  }
                }} />
              ) : null}
            </ListCard>
          </Stack>
        ))}

        <Stack gap="md">
          <Text variant="bodySmStrong" tone="muted">Current instance</Text>
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
            <Button title="Go to home feed" variant="tertiary" onPress={() => router.push('/feed')} />
          </Card>
        </Stack>

        <Stack gap="md">
          <Text variant="bodySmStrong" tone="muted">Instances on this device</Text>
          <ListCard>
            <ListRow title={instanceDisplayName(active.origin, active.name)} subtitle={active.origin.replace(/^https?:\/\//, '')} leading={<ServerIcon name={active.name} iconUrl={active.iconUrl} origin={active.origin} size={36} />} trailing={<Badge label="Current" />} />
            {others.map((i) => (
              <ListRow key={i.id}
                title={instanceDisplayName(i.origin, i.name)}
                subtitle={i.origin.replace(/^https?:\/\//, '')}
                leading={<ServerIcon name={i.name} iconUrl={i.iconUrl} origin={i.origin} size={36} />}
                trailing={<Text variant="captionMd" tone="muted">Switch</Text>}
                chevron
                onPress={() => {
                  instancesStore.getState().setActive(i.id);
                  resetTo('/feed');
                }}
              />
            ))}
            <ListRow title="Add an instance" icon="plus" chevron onPress={() => router.push('/welcome')} />
          </ListCard>
          <Button
            title={`Forget ${instanceDisplayName(active.origin, active.name)}`}
            variant="danger"
            disabled={busy}
            onPress={async () => {
              setBusy(true);
              setError(null);
              try {
                await forgetInstance(active.id);
                resetTo('/welcome');
              } catch (e) {
                setError(failureMessage(e, 'Could not forget this instance. Try again.'));
              } finally {
                setBusy(false);
              }
            }}
          />
        </Stack>
      </Stack>
      <PresenceSheet visible={picking} onClose={() => setPicking(false)} />
    </ScreenFrame>
  );
}
