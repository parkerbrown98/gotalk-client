import { unwrap } from '@gotalk/api-client';
import { Badge, Button, Checkbox, Dialog, ListCard, ListRow, Notice, Stack, Text, useTheme } from '@gotalk/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { FailureNotice } from '@/components/failure-notice';
import { ScreenFrame } from '@/components/screen-frame';
import { useApiClient, useConsents } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { consentDismissed } from '@/lib/consent';
import { classifyFailure, type FailureKind } from '@/lib/failure';
import { useActiveInstance } from '@/lib/instances';
import { resetTo, useWide } from '@/lib/layout';

/** Policies the instance published since this account last accepted, shown after sign-in. */
export default function Consent() {
  const theme = useTheme();
  const wide = useWide();
  const active = useActiveInstance();
  const session = useSession();
  const client = useApiClient();
  const queryClient = useQueryClient();
  const consents = useConsents();
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<FailureKind | null>(null);

  if (!active || !session) return <Redirect href="/connect" />;
  const outstanding = consents.data?.outstanding ?? [];
  const given = new Set((consents.data?.consents ?? []).filter((c) => c.granted).map((c) => c.purpose));
  if (consents.isSuccess && outstanding.length === 0) return <Redirect href="/home" />;

  function notNow() {
    consentDismissed.add(active!.id);
    resetTo('/home');
  }

  async function accept() {
    if (!client || pending) return;
    setPending(true);
    setFailure(null);
    try {
      for (const p of outstanding) {
        unwrap(await client.POST('/users/@me/consents', { body: { purpose: p.kind, granted: true, policy_version: p.version } }));
      }
      await queryClient.invalidateQueries({ queryKey: ['consents', active!.id] });
      resetTo('/home');
    } catch (e) {
      setFailure(classifyFailure(e));
    } finally {
      setPending(false);
    }
  }

  const list = (
    <ListCard>
      {outstanding.map((p) => (
        <ListRow
          key={p.kind}
          title={p.title}
          subtitle={`Version ${p.version}${wide ? ` · effective ${new Date(p.effective_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}` : ''}`}
          trailing={<Badge label={given.has(p.kind) ? 'Changed' : 'New'} tone="info" />}
          chevron
          onPress={() => router.push({ pathname: '/policy/[kind]', params: { kind: p.kind } })}
        />
      ))}
    </ListCard>
  );
  const accept_label = outstanding.length > 1 ? 'I have read and accept both.' : 'I have read and accept it.';
  const host = active.origin.replace(/^https?:\/\//, '');

  if (wide) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
        <Dialog visible onClose={notNow}>
          <Text variant="headingMd">{active.name} updated its policies</Text>
          <Text variant="bodySm" tone="muted">
            Read what changed, then accept to keep posting. You can still browse without accepting.
          </Text>
          {list}
          <Checkbox checked={accepted} onChange={setAccepted}>
            {accept_label}
          </Checkbox>
          <FailureNotice failure={failure} host={host} />
          <View style={{ flexDirection: 'row', gap: theme.space.sm, justifyContent: 'flex-end' }}>
            <Button title="Not now" variant="tertiary" onPress={notNow} />
            <Button title="Accept and continue" onPress={accept} loading={pending} disabled={!accepted} />
          </View>
        </Dialog>
      </View>
    );
  }

  return (
    <ScreenFrame
      title="Policies"
      end={
        <Pressable accessibilityRole="button" hitSlop={12} onPress={notNow}>
          <Text variant="bodySm" tone="onDark">
            Not now
          </Text>
        </Pressable>
      }
      contentStyle={{ flex: 1, padding: theme.space.lg, gap: theme.space.lg }}
    >
      <Stack gap="sm">
        <Text variant="headingXl" accessibilityRole="header">
          New policies
        </Text>
        <Text variant="bodySm" tone="muted">
          {active.name} changed the rules. Accept them to keep posting.
        </Text>
      </Stack>
      {list}
      <Checkbox checked={accepted} onChange={setAccepted}>
        {accept_label}
      </Checkbox>
      <FailureNotice failure={failure} host={host} />
      {consents.isError ? <Notice tone="danger">Policies could not be loaded.</Notice> : null}
      <View style={{ marginTop: 'auto' }}>
        <Button title="Accept and continue" onPress={accept} loading={pending} disabled={!accepted} />
      </View>
    </ScreenFrame>
  );
}
