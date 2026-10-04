import { unwrap } from '@gotalk/api-client';
import { describeLastUsed, describeUserAgent } from '@gotalk/core';
import { Badge, Button, Icon, ListCard, Notice, Stack, Text, useTheme } from '@gotalk/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { FailureNotice } from '@/components/failure-notice';
import { SettingsPage } from '@/components/settings-page';
import { useApiClient } from '@/lib/api';
import { classifyFailure, type FailureKind } from '@/lib/failure';
import { useActiveInstance } from '@/lib/instances';
import { useWide } from '@/lib/layout';
import { useSessions } from '@/lib/sessions';

export default function Devices() {
  const theme = useTheme();
  const wide = useWide();
  const active = useActiveInstance();
  const client = useApiClient();
  const queryClient = useQueryClient();
  const sessions = useSessions();
  const [ending, setEnding] = useState<string | 'others' | null>(null);
  const [failure, setFailure] = useState<FailureKind | null>(null);

  if (!active) return null;

  const list = [...(sessions.data ?? [])].sort(
    (a, b) => Number(b.current) - Number(a.current) || Date.parse(b.last_used_at) - Date.parse(a.last_used_at),
  );
  const others = list.filter((s) => !s.current);

  async function end(ids: string[], marker: string) {
    if (!client || ending) return;
    setEnding(marker);
    setFailure(null);
    try {
      for (const id of ids) {
        unwrap(await client.DELETE('/users/@me/sessions/{sessionID}', { params: { path: { sessionID: id } } }));
      }
    } catch (e) {
      setFailure(classifyFailure(e));
    } finally {
      setEnding(null);
      await queryClient.invalidateQueries({ queryKey: ['sessions', active!.id] });
    }
  }

  const icons = { browser: 'globe', phone: 'phone', desktop: 'laptop' } as const;

  return (
    <SettingsPage
      title="Devices"
      subtitle={
        wide
          ? `Where you are signed in to ${active.name}. End any session you do not recognize.`
          : 'End any session you do not recognize. It signs that device out right away.'
      }
    >
      <FailureNotice failure={failure} host={active.origin} />
      {sessions.isPending ? (
        <ActivityIndicator />
      ) : sessions.isError ? (
        <Notice tone="danger" title="Devices could not be loaded.">
          Pull down or reopen this screen to try again.
        </Notice>
      ) : (
        <>
          <ListCard>
            {list.map((s) => {
              const device = describeUserAgent(s.user_agent);
              return (
                <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.lg, padding: theme.space.lg }}>
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
                    <Icon name={icons[device.kind]} size={18} color={theme.colors.body} />
                  </View>
                  <Stack gap="none" style={{ flex: 1 }}>
                    <Text variant="bodySmStrong" tone="onDark">
                      {device.label}
                    </Text>
                    <Text variant="captionMd" tone="muted">
                      {s.ip_address ? `${s.ip_address} · ` : ''}
                      {s.current ? 'Active now' : describeLastUsed(s.last_used_at)}
                    </Text>
                  </Stack>
                  {s.current ? (
                    <Badge label="This device" />
                  ) : (
                    <Button
                      title={wide ? 'Sign out' : 'End'}
                      variant="outline"
                      size="sm"
                      loading={ending === s.id}
                      disabled={!!ending}
                      onPress={() => end([s.id], s.id)}
                    />
                  )}
                </View>
              );
            })}
          </ListCard>
          {others.length > 0 ? (
            <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'stretch', justifyContent: 'space-between', gap: theme.space.md }}>
              {wide ? (
                <Text variant="captionMd" tone="muted" style={{ flex: 1 }}>
                  Signing out ends a session right away. That device has to sign in again.
                </Text>
              ) : null}
              <Button
                title={`Sign out ${others.length} other ${others.length === 1 ? 'device' : 'devices'}`}
                variant="danger"
                loading={ending === 'others'}
                disabled={!!ending}
                onPress={() => end(others.map((s) => s.id), 'others')}
              />
            </View>
          ) : null}
        </>
      )}
    </SettingsPage>
  );
}
