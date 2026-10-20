import { unwrap } from '@gotalk/api-client';
import { describeLastUsed, pushCategoryChoices, pushUnavailableMessage, type PushUnavailableReason } from '@gotalk/core';
import { Badge, Button, Checkbox, Icon, ListCard, Notice, Stack, Text, useTheme } from '@gotalk/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Linking, Platform, View } from 'react-native';

import { SettingsPage } from '@/components/settings-page';
import { useApiClient, useInstanceInfo } from '@/lib/api';
import { failureMessage } from '@/lib/failure';
import { useActiveInstance } from '@/lib/instances';
import { useWide } from '@/lib/layout';
import { disablePush, enablePush, usePushRuntime, usePushStore } from '@/lib/push';
import { usePushDevice, usePushPreferences, usePushSubscriptions, useSetPushCategory } from '@/lib/push-hooks';

const BLOCKED: Record<string, string> = {
  web: "Notifications are blocked for this site. Allow them in your browser's site settings (the icon beside the address), then turn this on again.",
  ios: 'Notifications are off for Gotalk. Turn them on in Settings > Notifications > Gotalk, then come back.',
  android: "Notifications are off for Gotalk. Turn them on in your phone's settings, then come back.",
};

/**
 * Push notifications for the active instance: whether this device gets them (a choice per device and instance),
 * which categories the account is notified about (shared by all its devices), and the devices that receive them.
 */
export default function NotificationSettings() {
  const theme = useTheme();
  const wide = useWide();
  const active = useActiveInstance();
  const client = useApiClient();
  const queryClient = useQueryClient();
  const info = useInstanceInfo().data;
  const push = info?.push ?? null;
  const device = usePushDevice();
  const enabled = usePushStore((s) => !!active && !!s.enabled[active.id]);
  const registered = usePushStore((s) => !!active && !!s.registrations[active.id]);
  const busy = usePushRuntime((s) => !!active && !!s.busy[active.id]);
  const syncError = usePushRuntime((s) => (active ? (s.errors[active.id] ?? null) : null));
  const preferences = usePushPreferences();
  const setCategory = useSetPushCategory();
  const subscriptions = usePushSubscriptions();
  const [changing, setChanging] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!active) return null;
  const name = active.name;

  const serverReason: PushUnavailableReason | null = !info
    ? null
    : !push
      ? 'server_unsupported'
      : !push.enabled
        ? 'server_disabled'
        : !push.available
          ? 'server_pending'
          : null;
  const blocked = device.permission === 'denied';
  const reason = device.unsupported ?? serverReason;
  const canTurnOn = !reason && !blocked && !!info;

  async function toggle(on: boolean) {
    if (changing) return;
    setChanging(true);
    setError(null);
    try {
      if (on) await enablePush(active!.id);
      else await disablePush(active!.id);
    } catch {
      // Shown through the sync error, or the blocked notice for a refused permission.
    } finally {
      setChanging(false);
      device.recheck();
      await queryClient.invalidateQueries({ queryKey: ['push-subscriptions', active!.id] });
    }
  }

  async function remove(id: string) {
    if (!client || removing) return;
    setRemoving(id);
    setError(null);
    try {
      unwrap(await client.DELETE('/users/@me/push-subscriptions/{subscriptionID}', { params: { path: { subscriptionID: id } } }));
    } catch (e) {
      setError(failureMessage(e, 'The device could not be removed. Try again.'));
    } finally {
      setRemoving(null);
      await queryClient.invalidateQueries({ queryKey: ['push-subscriptions', active!.id] });
    }
  }

  const status = registered
    ? Platform.OS === 'web'
      ? `On. Notifications from ${name} arrive while this browser is running, even with Gotalk closed.`
      : `On. Notifications from ${name} arrive even when Gotalk is closed.`
    : enabled
      ? busy || changing
        ? 'Turning on…'
        : `On, waiting until ${name} is ready to send notifications.`
      : `Get notified about mentions, replies and messages on ${name}, even when Gotalk is closed.`;

  const categories = pushCategoryChoices(push?.categories, preferences.data);
  const devices = [...(subscriptions.data ?? [])].sort((a, b) => Number(b.current) - Number(a.current) || Date.parse(b.created_at) - Date.parse(a.created_at));
  const icons = { web: 'globe', ios: 'phone', android: 'phone' } as const;

  return (
    <SettingsPage title="Notifications" subtitle={wide ? `Push notifications from ${name}.` : undefined}>
      <Stack gap="md">
        <Text variant="headingSm">This device</Text>
        <Checkbox
          checked={enabled}
          disabled={changing || (!enabled && !canTurnOn)}
          onChange={(on) => void toggle(on)}
          accessibilityLabel="Push notifications on this device"
          description={status}
        >
          Push notifications on this device
        </Checkbox>
        {changing || busy ? <ActivityIndicator style={{ alignSelf: 'flex-start' }} /> : null}
        {reason ? <Notice tone="info">{pushUnavailableMessage(reason)}</Notice> : null}
        {!reason && blocked ? (
          <Notice tone="warning" title="Notifications are blocked">
            <Stack gap="sm">
              <Text variant="bodySm">{BLOCKED[Platform.OS] ?? BLOCKED.android}</Text>
              {Platform.OS !== 'web' ? (
                <Button title="Open settings" variant="outline" size="sm" style={{ alignSelf: 'flex-start' }} onPress={() => void Linking.openSettings()} />
              ) : null}
            </Stack>
          </Notice>
        ) : null}
        {syncError && !blocked && !reason ? <Notice tone="danger">{syncError}</Notice> : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </Stack>

      {push?.enabled ? (
        <Stack gap="md">
          <Stack gap="xs">
            <Text variant="headingSm">What to notify you about</Text>
            <Text variant="captionMd" tone="muted">
              For all your devices on {name}. Muted places, channels and conversations never notify you, and nothing is sent while you are set to Do not disturb.
            </Text>
          </Stack>
          {preferences.isPending ? (
            <ActivityIndicator style={{ alignSelf: 'flex-start' }} />
          ) : preferences.isError ? (
            <Notice tone="danger">Your notification choices could not be loaded.</Notice>
          ) : (
            categories.map((c) => (
              <Checkbox
                key={c.id}
                checked={c.enabled}
                onChange={(on) => setCategory.mutate({ category: c.id, enabled: on }, { onError: (e) => setError(failureMessage(e, 'That change was not saved. Try again.')) })}
                accessibilityLabel={c.label}
                description={c.description || undefined}
              >
                {c.label}
              </Checkbox>
            ))
          )}
        </Stack>
      ) : null}

      {devices.length > 0 ? (
        <Stack gap="md">
          <Text variant="headingSm">Devices that get notifications</Text>
          <ListCard>
            {devices.map((d) => (
              <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.lg, padding: theme.space.lg }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: theme.radii.md,
                    backgroundColor: theme.colors.surfaceCard,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name={icons[d.platform]} size={18} color={theme.colors.body} />
                </View>
                <Stack gap="none" style={{ flex: 1 }}>
                  <Text variant="bodySmStrong" tone="onDark">
                    {d.device_name || (d.platform === 'web' ? 'Browser' : d.platform === 'ios' ? 'iPhone or iPad' : 'Android device')}
                  </Text>
                  <Text variant="captionMd" tone="muted">
                    {d.last_push_at ? `Last notified ${describeLastUsed(d.last_push_at).replace(/^Active now$/, 'just now')}` : 'Not notified yet'}
                  </Text>
                </Stack>
                {d.current ? (
                  <Badge label="This device" />
                ) : (
                  <Button title="Remove" variant="outline" size="sm" loading={removing === d.id} disabled={!!removing} onPress={() => void remove(d.id)} />
                )}
              </View>
            ))}
          </ListCard>
          <Text variant="captionMd" tone="muted">
            Removing a device stops its notifications from {name}. Signing out on a device does the same.
          </Text>
        </Stack>
      ) : null}
    </SettingsPage>
  );
}
