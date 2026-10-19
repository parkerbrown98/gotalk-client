import { platformStatusLabel, policyKindLabel, relativeTime, shortKey, suggestedPolicyText, type DirectoryStatus } from '@gotalk/core';
import { Badge, Button, Card, Dialog, Icon, Notice, Stack, Text, useTheme } from '@gotalk/ui';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { InlineLink } from '@/components/inline-link';
import { copyText } from '@/lib/clipboard';
import { openExternal } from '@/lib/desktop';
import { failureMessage } from '@/lib/failure';
import { useDirectoryActions, useDirectoryAudit, useDirectoryStatus, usePlatformView } from '@/lib/search-index';

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null);

function Row({ label, children }: { label: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space.xxs, paddingVertical: theme.space.sm, borderTopWidth: 1, borderTopColor: theme.colors.hairline }}>
      <Text variant="captionMd" tone="muted">
        {label}
      </Text>
      {children}
    </View>
  );
}

/**
 * The public directory beyond its settings form: what the instance publishes, its keys, how the index sees
 * it, the server's notice and suggested policy text. Shown under the Public directory section of Server.
 */
export function DirectoryPanel() {
  const status = useDirectoryStatus();
  if (status.isPending) return <ActivityIndicator />;
  if (status.isError || !status.data) return <Notice tone="danger">{failureMessage(status.error, 'The directory status could not be loaded. Try again in a moment.')}</Notice>;
  const s = status.data;
  return (
    <Stack gap="lg">
      {s.notice ? <Notice tone="info">{s.notice}</Notice> : null}
      <ListingCard status={s} />
      <PlatformCard status={s} />
      <KeysCard status={s} />
      <PolicyTextCard status={s} />
      <AuditCard />
      <Text variant="captionMd" tone="muted">
        What listing means for your members and how removal works:{' '}
        <InlineLink variant="captionMd" onPress={() => openExternal(s.operator_guide_url)}>
          read the operator guide
        </InlineLink>
        .
      </Text>
    </Stack>
  );
}

function ListingCard({ status: s }: { status: DirectoryStatus }) {
  return (
    <Card compact>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text variant="headingSm" style={{ flex: 1 }}>
          This instance
        </Text>
        <Badge label={s.listed ? 'Listed' : 'Not listed'} tone={s.listed ? 'success' : 'neutral'} />
      </View>
      <View>
        <Row label="Well-known document">
          <Text variant="bodySm" selectable>
            {s.listed ? `/.well-known/gotalk-instance announces the listing and the index endpoints at ${s.index_url}.` : '/.well-known/gotalk-instance does not mention the directory.'}
          </Text>
        </Row>
        <Row label="Places in the index">
          <Text variant="bodySm">
            {s.places_indexed === 1 ? '1 place' : `${s.places_indexed.toLocaleString()} places`}
            {s.listed && s.places_indexed === 0 ? '. Place owners choose this in their place settings.' : ''}
          </Text>
        </Row>
        <Row label="Pings">
          <Text variant="bodySm">
            {!s.listed
              ? "Off while the instance isn't listed."
              : !s.pings
                ? 'Off. The index picks up changes on its next scheduled read.'
                : s.last_ping_at ? `On. Last sent ${relativeTime(s.last_ping_at)}.` : 'On. None sent yet.'}
          </Text>
        </Row>
      </View>
    </Card>
  );
}

function PlatformCard({ status: s }: { status: DirectoryStatus }) {
  const view = usePlatformView(s.platform_status_url);
  const host = s.platform_url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const result = view.data;
  let body: ReactNode;
  if (view.isPending) body = <ActivityIndicator style={{ alignSelf: 'flex-start' }} />;
  else if (!result || result.kind === 'unreachable') {
    body = (
      <Text variant="captionMd" tone="muted">
        {`${host} couldn't be reached from here, so its view isn't shown. This doesn't affect the listing.`}
      </Text>
    );
  } else if (result.kind === 'unregistered') {
    body = (
      <Text variant="bodySm" tone="muted">
        {s.listed ? 'Not registered with the index yet. The operator guide below explains how to register.' : 'Not registered with the index yet.'}
      </Text>
    );
  } else {
    const v = result.view;
    const label = platformStatusLabel(v.status);
    body = (
      <View>
        <Row label="Status">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Badge label={label.label} tone={label.tone} />
            {v.listedSince ? (
              <Text variant="captionMd" tone="muted">
                since {when(v.listedSince)}
              </Text>
            ) : null}
          </View>
          {label.detail ? (
            <Text variant="captionMd" tone="muted">
              {label.detail}
            </Text>
          ) : null}
        </Row>
        <Row label="Indexed">
          <Text variant="bodySm">
            {[v.placesIndexed !== null ? `${v.placesIndexed.toLocaleString()} ${v.placesIndexed === 1 ? 'place' : 'places'}` : null, v.topicsIndexed !== null ? `${v.topicsIndexed.toLocaleString()} ${v.topicsIndexed === 1 ? 'topic' : 'topics'}` : null]
              .filter(Boolean)
              .join(', ') || 'Not reported'}
          </Text>
        </Row>
        <Row label="Last crawl">
          <Text variant="bodySm">{v.lastCrawlAt ? relativeTime(v.lastCrawlAt) : 'Not crawled yet'}</Text>
        </Row>
      </View>
    );
  }
  return (
    <Card compact>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Stack gap="none" style={{ flex: 1 }}>
          <Text variant="headingSm">{`How ${host} sees it`}</Text>
          <Text variant="captionMd" tone="muted">
            {"The index's public status for this instance."}
          </Text>
        </Stack>
        <Button title="Check again" variant="tertiary" size="sm" loading={view.isFetching && !view.isPending} onPress={() => void view.refetch()} />
      </View>
      {body}
    </Card>
  );
}

type KeyConfirm = 'rotate' | 'revoke' | null;

function KeysCard({ status: s }: { status: DirectoryStatus }) {
  const theme = useTheme();
  const actions = useDirectoryActions();
  const [confirm, setConfirm] = useState<KeyConfirm>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keys = s.public_keys ?? [];

  async function run() {
    const kind = confirm;
    setBusy(true);
    setError(null);
    try {
      if (kind === 'rotate') await actions.rotateKey();
      else await actions.revokePreviousKey();
      setConfirm(null);
    } catch (e) {
      setError(failureMessage(e, kind === 'rotate' ? 'The key could not be rotated. Try again.' : 'The previous key could not be removed. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  const source =
    s.key_source === 'configured'
      ? 'Set in the configuration (directory.signing_key). Change it there to rotate it.'
      : s.key_source === 'generated'
        ? 'Generated and stored by the instance.'
        : 'No key yet. One is generated when listing turns on.';

  return (
    <Card compact>
      <Stack gap="none">
        <Text variant="headingSm">Signing keys</Text>
        <Text variant="captionMd" tone="muted">
          Pings to the index are signed. These public keys are published in the well-known document so the index can check them.
        </Text>
      </Stack>
      <View>
        {keys.map((k, i) => (
          <Row key={k.public_key} label={i === 0 ? `Current key · ${k.alg}` : `Published key · ${k.alg}`}>
            <Text variant="bodySm" selectable accessibilityLabel={`${k.alg} public key ${k.public_key}`}>
              {k.public_key}
            </Text>
          </Row>
        ))}
        {s.previous_key ? (
          <Row label="Previous key, still published">
            <Text variant="bodySm" selectable>
              {shortKey(s.previous_key)}
            </Text>
          </Row>
        ) : null}
        <Row label="Source">
          <Text variant="captionMd" tone="muted">
            {source}
          </Text>
        </Row>
      </View>
      {error && !confirm ? <Notice tone="danger">{error}</Notice> : null}
      {s.key_source === 'generated' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
          <Button title="Rotate key" variant="tertiary" size="sm" onPress={() => setConfirm('rotate')} />
          {s.previous_key ? <Button title="Stop publishing previous key" variant="secondary" size="sm" onPress={() => setConfirm('revoke')} /> : null}
        </View>
      ) : null}
      <Dialog visible={confirm !== null} onClose={() => (busy ? undefined : setConfirm(null))}>
        <Text variant="headingMd" accessibilityRole="header">
          {confirm === 'revoke' ? 'Stop publishing the previous key?' : 'Rotate the signing key?'}
        </Text>
        <Text variant="bodySm" tone="muted">
          {confirm === 'revoke'
            ? 'Pings signed with it no longer verify. Do this once the index has read the new key, a few minutes after rotating.'
            : 'Pings are signed with a new key from now on. The old public key stays published until you stop publishing it, so pings sent just before the switch still verify.'}
        </Text>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: theme.space.sm }}>
          <Button title="Cancel" variant="tertiary" disabled={busy} onPress={() => setConfirm(null)} />
          <Button title={confirm === 'revoke' ? 'Stop publishing' : 'Rotate key'} variant={confirm === 'revoke' ? 'danger' : 'primary'} loading={busy} onPress={() => void run()} />
        </View>
      </Dialog>
    </Card>
  );
}

function PolicyTextCard({ status: s }: { status: DirectoryStatus }) {
  const theme = useTheme();
  const c = theme.colors;
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const sections = suggestedPolicyText(s.policy_text);
  if (sections.length === 0) return null;
  return (
    <Card compact>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel="Suggested policy text"
        onPress={() => setOpen((o) => !o)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
      >
        <Stack gap="none" style={{ flex: 1 }}>
          <Text variant="headingSm">Suggested policy text</Text>
          <Text variant="captionMd" tone="muted">
            Sections to add to your terms, privacy policy and guidelines. Nothing is published until you do it in Policies.
          </Text>
        </Stack>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={16} color={c.mute} />
      </Pressable>
      {open ? (
        <Stack gap="md">
          {s.license_pending ? (
            <Notice tone="warning" title="Pending legal review.">
              {"The clause that would let the index show excerpts of posts isn't written yet, so the suggested terms hold a placeholder in its place and grant no license."}
            </Notice>
          ) : null}
          {sections.map((p) => (
            <Stack key={p.kind} gap="xs">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text variant="bodySmStrong" tone="onDark" style={{ flex: 1 }}>
                  {policyKindLabel(p.kind)}
                </Text>
                <Button
                  title={copied === p.kind ? 'Copied' : 'Copy'}
                  variant="tertiary"
                  size="sm"
                  onPress={() => void copyText(p.text).then(() => setCopied(p.kind))}
                />
                <Button title="Open" variant="secondary" size="sm" onPress={() => router.push({ pathname: '/settings/policies/[kind]', params: { kind: p.kind } })} />
              </View>
              <View style={{ padding: theme.space.md, borderRadius: theme.radii.md, borderWidth: 1, borderColor: c.hairline, backgroundColor: c.canvas }}>
                <Text variant="captionMd" selectable>
                  {p.text}
                </Text>
              </View>
            </Stack>
          ))}
        </Stack>
      ) : null}
    </Card>
  );
}

function AuditCard() {
  const audit = useDirectoryAudit();
  const items = audit.data ?? [];
  if (items.length === 0) return null;
  return (
    <Card compact>
      <Text variant="headingSm">Recent changes</Text>
      <View>
        {items.map(({ entry, text }) => (
          <Row key={entry.id} label={when(entry.created_at) ?? ''}>
            <Text variant="bodySm">{text}</Text>
          </Row>
        ))}
      </View>
    </Card>
  );
}
