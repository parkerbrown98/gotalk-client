import { policyKindLabel, policyVersionState } from '@gotalk/core';
import { Badge, Button, Checkbox, Dialog, Icon, ListCard, Notice, PillTabs, Stack, Text, TextField, useTheme } from '@gotalk/ui';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';

import { Markdown } from '@/components/markdown';
import { SettingsPage } from '@/components/settings-page';
import { useMe } from '@/lib/api';
import { POLICY_KINDS, useAdminActions, useCurrentPolicy, usePolicyVersion, usePolicyVersions, type Policy, type PolicyKind, type PolicySummary } from '@/lib/admin';
import { failureMessage } from '@/lib/failure';

const DAY = 86_400_000;

/** Why a YYYY-MM-DD date cannot be used to schedule a version, or null. The server allows up to a year ahead. */
function scheduleProblem(date: string, now = Date.now()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return 'Enter the date as YYYY-MM-DD.';
  const at = Date.parse(`${date}T00:00:00Z`);
  if (at <= now) return 'Pick a date after today.';
  if (at > now + 365 * DAY) return 'Pick a date within a year.';
  return null;
}

export default function PolicyPage() {
  const theme = useTheme();
  const { kind: raw } = useLocalSearchParams<{ kind: string }>();
  const kind = POLICY_KINDS.find((k) => k === raw);
  const me = useMe();
  const current = useCurrentPolicy(kind);
  const versions = usePolicyVersions(kind);
  const [publishing, setPublishing] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);

  if (!kind || (me.data && !me.data.is_instance_admin)) return <Redirect href="/settings/policies" />;
  const label = policyKindLabel(kind);
  const list = versions.data ?? [];
  const next = (list[0]?.version ?? 0) + 1;
  const loading = current.isPending || versions.isPending;

  const back = (
    <Pressable
      accessibilityRole="link"
      onPress={() => (publishing ? setPublishing(false) : router.replace('/settings/policies'))}
      hitSlop={6}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}
    >
      <Icon name="chevronLeft" size={14} color={theme.colors.mute} />
      <Text variant="captionMd" tone="muted">
        {publishing ? label : 'Policies'}
      </Text>
    </Pressable>
  );

  if (publishing && !loading) {
    return (
      <SettingsPage title={`Publish ${label.toLowerCase()}, version ${next}`} width={720}>
        {back}
        <PublishForm kind={kind} current={current.data ?? null} next={next} onDone={() => setPublishing(false)} />
      </SettingsPage>
    );
  }

  return (
    <SettingsPage title={label} subtitle="Publishing a new version keeps the earlier ones in the changelog. Versions cannot be edited once published." width={720}>
      <Stack gap="lg">
        {back}
        <Button title="Publish new version" onPress={() => setPublishing(true)} disabled={loading} style={{ alignSelf: 'flex-start' }} />
        {loading ? <ActivityIndicator /> : null}
        {current.isError || versions.isError ? <Notice tone="danger">The versions could not be loaded. Try again in a moment.</Notice> : null}
        {versions.isSuccess && list.length === 0 ? (
          <Text variant="bodySm" tone="muted">
            Not published yet.
          </Text>
        ) : null}
        {list.length > 0 ? (
          <ListCard>
            {list.map((v) => (
              <VersionRow key={v.version} version={v} inEffect={current.data?.version === v.version} onView={() => setViewing(v.version)} />
            ))}
          </ListCard>
        ) : null}
      </Stack>
      <VersionDialog kind={kind} version={viewing} onClose={() => setViewing(null)} />
    </SettingsPage>
  );
}

function VersionRow({ version: v, inEffect, onView }: { version: PolicySummary; inEffect: boolean; onView: () => void }) {
  const theme = useTheme();
  const scheduled = policyVersionState(v.effective_at) === 'scheduled';
  const date = new Date(v.effective_at).toLocaleDateString(undefined, { dateStyle: 'medium' });
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md, paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md }}>
      <Stack gap="xs" style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.space.sm }}>
          <Text variant="bodySmStrong" tone={inEffect || scheduled ? 'onDark' : 'muted'}>
            Version {v.version}
          </Text>
          {inEffect ? <Badge label="In effect" tone="success" /> : null}
          {scheduled ? <Badge label="Scheduled" tone="info" /> : null}
          {v.requires_consent ? <Badge label="Consent required" /> : null}
        </View>
        {v.summary ? (
          <Text variant="bodySm" numberOfLines={2}>
            {v.summary}
          </Text>
        ) : null}
        <Text variant="captionMd" tone="muted">
          {scheduled ? `Takes effect ${date}` : `Took effect ${date}`}
        </Text>
      </Stack>
      <Button title="View" variant="outline" size="sm" onPress={onView} />
    </View>
  );
}

function VersionDialog({ kind, version, onClose }: { kind: PolicyKind; version: number | null; onClose: () => void }) {
  const { height } = useWindowDimensions();
  const [shown, setShown] = useState(version);
  if (version !== null && version !== shown) setShown(version);
  const policy = usePolicyVersion(kind, shown ?? undefined);
  return (
    <Dialog visible={version !== null} onClose={onClose}>
      <Text variant="headingMd" accessibilityRole="header">
        {policy.data?.title || policyKindLabel(kind)}, version {shown}
      </Text>
      {policy.isPending ? <ActivityIndicator /> : null}
      {policy.isError ? <Notice tone="danger">This version could not be loaded.</Notice> : null}
      {policy.data ? (
        <ScrollView style={{ maxHeight: height * 0.6 }}>
          <Markdown source={policy.data.content} />
        </ScrollView>
      ) : null}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <Button title="Done" variant="tertiary" onPress={onClose} />
      </View>
    </Dialog>
  );
}

function PublishForm({ kind, current, next, onDone }: { kind: PolicyKind; current: Policy | null; next: number; onDone: () => void }) {
  const theme = useTheme();
  const actions = useAdminActions();
  const [title, setTitle] = useState(current?.title ?? policyKindLabel(kind));
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState(current?.content ?? '');
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [consent, setConsent] = useState(current?.requires_consent ?? kind !== 'guidelines');
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [date, setDate] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function review() {
    if (!content.trim()) return setError('Write the policy text first.');
    if (current && content.trim() === current.content.trim() && title.trim() === current.title) return setError('Nothing has changed since version ' + current.version + '.');
    if (when === 'later') {
      const problem = scheduleProblem(date);
      if (problem) return setError(problem);
    }
    setError(null);
    setConfirming(true);
  }

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      await actions.publishPolicy(kind, {
        content: content.trim(),
        title: title.trim() || undefined,
        summary: summary.trim() || undefined,
        requires_consent: consent,
        effective_at: when === 'later' ? new Date(`${date}T00:00:00Z`).toISOString() : undefined,
      });
      setConfirming(false);
      onDone();
    } catch (e) {
      setConfirming(false);
      setError(failureMessage(e, 'The policy could not be published. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  const effect = when === 'later' && !scheduleProblem(date) ? `on ${new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { dateStyle: 'long', timeZone: 'UTC' })}` : 'right away';
  return (
    <Stack gap="lg">
      <TextField label="Title" value={title} onChangeText={setTitle} maxLength={200} />
      <TextField label="What changed" value={summary} onChangeText={setSummary} maxLength={2000} multiline placeholder={current ? 'A sentence or two about this version' : 'First version'} hint="Shown in the changelog and to people asked to accept it." />
      <Stack gap="sm">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="bodySmStrong" tone="onDark">
            Text
          </Text>
          <PillTabs options={[{ value: 'write', label: 'Write' }, { value: 'preview', label: 'Preview' }]} value={tab} onChange={setTab} />
        </View>
        {tab === 'write' ? (
          <TextField value={content} onChangeText={setContent} multiline maxLength={200000} accessibilityLabel="Policy text in Markdown" style={{ minHeight: 320, fontFamily: theme.fontFamilies.mono, fontSize: 14 }} hint={current ? `Starts from version ${current.version}. Markdown.` : 'Markdown.'} />
        ) : (
          <View style={{ minHeight: 320, padding: theme.space.lg, borderRadius: theme.radii.md, borderWidth: 1, borderColor: theme.colors.hairline, backgroundColor: theme.colors.surface }}>
            {content.trim() ? <Markdown source={content} /> : <Text tone="muted">Nothing to preview yet.</Text>}
          </View>
        )}
      </Stack>
      <Checkbox checked={consent} onChange={setConsent} description="People are asked when they next open the app; signing up includes it.">
        Ask everyone to accept this version
      </Checkbox>
      <Stack gap="sm">
        <Text variant="bodySmStrong" tone="onDark">
          Takes effect
        </Text>
        <PillTabs
          options={[{ value: 'now', label: 'Now' }, { value: 'later', label: 'On a date' }]}
          value={when}
          onChange={(v) => {
            setWhen(v);
            setError(null);
          }}
        />
        {when === 'later' ? (
          <TextField
            label="Date (UTC)"
            value={date}
            onChangeText={(v) => {
              setDate(v);
              setError(null);
            }}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
            maxLength={10}
            hint="Up to a year ahead. It takes effect at midnight UTC."
          />
        ) : null}
      </Stack>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
        <Button title="Publish" onPress={review} />
        <Button title="Cancel" variant="tertiary" onPress={onDone} />
      </View>
      <Dialog visible={confirming} onClose={() => setConfirming(false)}>
        <Text variant="headingMd" accessibilityRole="header">
          Publish version {next}?
        </Text>
        <Text variant="bodySm" tone="muted">
          It takes effect {effect}.{' '}
          {consent ? 'Everyone is asked to accept it before carrying on, and new accounts accept it when signing up.' : 'Nobody is asked to accept it.'} Published versions cannot be edited or removed.
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: theme.space.sm }}>
          <Button title="Cancel" variant="tertiary" onPress={() => setConfirming(false)} />
          <Button title="Publish" loading={busy} onPress={publish} />
        </View>
      </Dialog>
    </Stack>
  );
}
