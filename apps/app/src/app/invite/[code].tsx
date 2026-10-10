import { createGotalkClient, unwrap } from '@gotalk/api-client';
import { discoverInstance, isInviteCode, serverParam } from '@gotalk/core';
import { Button, Notice, Stack, Text, useTheme } from '@gotalk/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { FailureNotice } from '@/components/failure-notice';
import { InstanceIcon } from '@/components/instance-summary';
import { ScreenFrame } from '@/components/screen-frame';
import { authManager, useAuth } from '@/lib/auth';
import { classifyFailure, type FailureKind } from '@/lib/failure';
import { instancesStore, useActiveInstance, useInstances } from '@/lib/instances';
import { resetTo, useWide } from '@/lib/layout';
import { pendingInvite } from '@/lib/pending-invite';
import { welcomeHref } from '@/lib/welcome';

/**
 * Opened from an invite link: `/invite/<code>?instance=<origin>` on the web, `gotalk://invite/<code>?...` in apps.
 * It works before sign-in: the preview is public, and signing in or up carries on to joining.
 */
export default function InviteScreen() {
  const theme = useTheme();
  const wide = useWide();
  const queryClient = useQueryClient();
  const { code, instance } = useLocalSearchParams<{ code: string; instance?: string }>();
  const instances = useInstances((s) => s.instances);
  const active = useActiveInstance();
  const origin = (instance ?? active?.origin)?.replace(/\/+$/, '');
  const saved = instances.find((i) => i.origin === origin);
  const [joining, setJoining] = useState(false);
  const [failure, setFailure] = useState<FailureKind | null>(null);

  const found = useQuery({
    queryKey: ['invite-instance', origin],
    enabled: !!origin && !saved,
    retry: false,
    queryFn: () => discoverInstance(origin!),
  });
  const target = saved ? { id: saved.id, apiBaseUrl: saved.apiBaseUrl } : found.data ? { id: found.data.id, apiBaseUrl: found.data.apiBaseUrl } : null;
  const validCode = isInviteCode(code ?? '');
  const preview = useQuery({
    queryKey: ['invite-preview', origin, code],
    enabled: !!target && validCode,
    retry: false,
    queryFn: async () => unwrap(await createGotalkClient({ baseUrl: target!.apiBaseUrl }).GET('/invites/{code}', { params: { path: { code: code! } } })),
  });
  const session = useAuth((s) => (target ? s.sessions[target.id] : undefined));

  const host = origin?.replace(/^https?:\/\//, '') ?? '';
  const place = preview.data?.place;
  const incompatible = found.data && !found.data.compatibility.ok ? found.data.compatibility.reason : null;

  function continueOnServer(tab: 'sign-in' | 'create') {
    pendingInvite.set({ code: code!, origin: origin! });
    // The welcome screen's account step reuses this look-up instead of making its own.
    if (found.data) queryClient.setQueryData(['server', serverParam(found.data.origin)], found.data);
    router.push(welcomeHref(saved?.origin ?? origin, tab));
  }

  async function join() {
    if (!target || !saved) return;
    setJoining(true);
    setFailure(null);
    try {
      const joined = unwrap(await authManager.clientFor(target).POST('/invites/{code}', { params: { path: { code: code! } } }));
      instancesStore.getState().setActive(saved.id);
      await queryClient.invalidateQueries({ queryKey: ['places', saved.id] });
      pendingInvite.clear();
      resetTo({ pathname: '/places/[slug]', params: { slug: joined.slug } });
    } catch (e) {
      setFailure(classifyFailure(e));
    } finally {
      setJoining(false);
    }
  }

  let body;
  if (!origin || !validCode) {
    body = (
      <Notice tone="danger" title="This invite link is not complete.">
        It needs the invite code and the instance it belongs to. Ask the person who sent it for a new link.
      </Notice>
    );
  } else if (found.isError || incompatible) {
    body = (
      <Notice tone="danger" title={incompatible ? "This instance isn't compatible with this app." : `Could not reach ${host}.`}>
        {incompatible ?? 'Check the link and your connection, then try again.'}
      </Notice>
    );
  } else if (preview.isError) {
    body = (
      <Notice tone="danger" title="This invite is no longer valid.">
        It has expired, reached its use limit, or was revoked. Ask for a new one.
      </Notice>
    );
  } else if (!place) {
    body = <ActivityIndicator />;
  } else {
    body = (
      <Stack gap="xl">
        <Stack gap="lg" align="flex-start">
          <InstanceIcon name={place.name} iconUrl={place.icon_url} origin={origin} size={64} />
          <Stack gap="xs">
            <Text variant="headingXl" accessibilityRole="header">
              You're invited to {place.name}
            </Text>
            <Text variant="bodySm" tone="muted">
              {host} · {place.member_count.toLocaleString()} {place.member_count === 1 ? 'member' : 'members'}
            </Text>
          </Stack>
          {place.description ? (
            <Text variant="bodySm" tone="muted">
              {place.description}
            </Text>
          ) : null}
          {!saved ? (
            <Text variant="bodySm" tone="muted">
              {place.name} is on a different instance from the ones saved on this device. Signing in adds that instance to your list.
            </Text>
          ) : null}
        </Stack>
        <FailureNotice failure={failure} host={host} />
        {session ? (
          <Button title={`Join ${place.name}`} onPress={join} loading={joining} />
        ) : (
          <Stack gap="md">
            <Button title={`Sign in to ${host}`} onPress={() => continueOnServer('sign-in')} />
            <Button title="Create an account" variant="tertiary" onPress={() => continueOnServer('create')} />
            <Text variant="captionMd" tone="muted" style={{ textAlign: 'center' }}>
              Invite code {code} is applied automatically.
            </Text>
          </Stack>
        )}
      </Stack>
    );
  }

  return (
    <ScreenFrame
      title="Invitation"
      onBack={() => (router.canGoBack() ? router.back() : resetTo('/'))}
      maxWidth={480}
      contentStyle={{ flexGrow: 1, justifyContent: 'center', padding: wide ? theme.space.xxl : theme.space.lg }}
    >
      {body}
    </ScreenFrame>
  );
}
