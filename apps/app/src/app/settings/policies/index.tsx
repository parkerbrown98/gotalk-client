import { policyKindLabel, policyVersionState } from '@gotalk/core';
import { Badge, Button, ListCard, ListRow, Notice, Stack } from '@gotalk/ui';
import { Redirect, router } from 'expo-router';
import { ActivityIndicator } from 'react-native';

import { SettingsPage } from '@/components/settings-page';
import { useMe } from '@/lib/api';
import { usePolicySummaries, usePolicyVersions, type PolicyKind, type PolicySummary } from '@/lib/admin';

const KINDS: PolicyKind[] = ['terms', 'privacy', 'guidelines'];

export default function Policies() {
  const me = useMe();
  const policies = usePolicySummaries();
  if (me.data && !me.data.is_instance_admin) return <Redirect href="/settings" />;
  const current = policies.data ?? [];
  return (
    <SettingsPage title="Policies" subtitle="Documents people agree to. Publishing a new version keeps the old ones in the changelog.">
      <Stack gap="lg">
        {me.isPending || policies.isPending ? <ActivityIndicator /> : null}
        {policies.isError ? <Notice tone="danger">Policies could not be loaded.</Notice> : null}
        <ListCard>
          {KINDS.map((kind) => (
            <PolicyRow key={kind} kind={kind} current={current.find((p) => p.kind === kind)} />
          ))}
        </ListCard>
      </Stack>
    </SettingsPage>
  );
}

function PolicyRow({ kind, current }: { kind: PolicyKind; current: PolicySummary | undefined }) {
  const versions = usePolicyVersions(kind);
  const scheduled = versions.data?.find((v) => policyVersionState(v.effective_at) === 'scheduled');
  const subtitle = current
    ? `Version ${current.version} · in effect since ${new Date(current.effective_at).toLocaleDateString()}${current.requires_consent ? ' · consent required' : ''}`
    : 'Not published';
  const open = () => router.push({ pathname: '/settings/policies/[kind]', params: { kind } });
  // The Publish button is the row's only action; a pressable row around it would nest <button>s on web.
  const showPublish = !scheduled && !current;
  return (
    <ListRow
      icon="shield"
      title={policyKindLabel(kind)}
      subtitle={subtitle}
      chevron={!showPublish}
      trailing={
        scheduled ? (
          <Badge label={`Version ${scheduled.version} scheduled ${new Date(scheduled.effective_at).toLocaleDateString()}`} tone="info" />
        ) : showPublish ? (
          <Button title="Publish" variant="outline" size="sm" onPress={open} />
        ) : undefined
      }
      onPress={showPublish ? undefined : open}
    />
  );
}
