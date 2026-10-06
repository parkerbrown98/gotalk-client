import { REPORT_STATUS_LABELS, relativeTime, reportReasonLabel } from '@gotalk/core';
import { Avatar, Badge, Button, Card, Dialog, Notice, PillTabs, Stack, Text, TextField, useTheme } from '@gotalk/ui';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { MemberModerationDialog } from '@/components/moderation';
import { PlaceSettingsPage, usePlaceSettings } from '@/components/place-settings';
import { useSession } from '@/lib/auth';
import { failureMessage } from '@/lib/failure';
import { useModerationActions, useReports, type Report, type ReportStatus } from '@/lib/moderation';
import { useChannels, type Place } from '@/lib/places';

const tabs: { value: ReportStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
];

export default function Reports() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { place, access } = usePlaceSettings(slug);
  const allowed = access.can('MANAGE_REPORTS');
  const [status, setStatus] = useState<ReportStatus>('open');
  const reports = useReports(place?.slug, status, allowed);
  const channels = useChannels(place?.slug, allowed).data ?? [];
  const [acting, setActing] = useState<string | null>(null);
  const [closing, setClosing] = useState<{ report: Report; status: 'resolved' | 'dismissed' } | null>(null);
  const myId = useSession()?.userId;

  if (!place) return null;
  if (!allowed) return <Redirect href={{ pathname: '/places/[slug]/settings', params: { slug: place.slug } }} />;
  const list = reports.data?.pages.flatMap((p) => p.items ?? []) ?? [];
  const canAct = access.can('KICK_MEMBERS') || access.can('BAN_MEMBERS') || access.can('MODERATE_MEMBERS') || access.can('MANAGE_ROLES');
  const channelName = (id: string | null) => channels.find((c) => c.id === id)?.name;

  return (
    <PlaceSettingsPage slug={place.slug} title="Reports" description="Reports from members, newest first. Resolving or dismissing one records it in the audit log.">
      <Stack gap="lg">
        <PillTabs options={tabs} value={status} onChange={setStatus} />
        {reports.isPending ? <ActivityIndicator /> : null}
        {reports.isError ? (
          <Stack gap="sm">
            <Notice tone="danger" title="Reports could not be loaded.">
              Check your connection and try again.
            </Notice>
            <Button title="Try again" variant="tertiary" onPress={() => void reports.refetch()} style={{ alignSelf: 'flex-start' }} />
          </Stack>
        ) : null}
        {reports.isSuccess && list.length === 0 ? (
          <Text variant="bodySm" tone="muted">
            {status === 'open' ? 'Nothing to review. New reports show up here.' : `No ${REPORT_STATUS_LABELS[status].toLowerCase()} reports.`}
          </Text>
        ) : null}
        {list.map((r) => (
          <ReportCard
            key={r.id}
            place={place}
            report={r}
            channelName={channelName(r.channel_id)}
            canAct={canAct && r.target_user.id !== place.owner_id && r.target_user.id !== myId}
            onAct={() => setActing(r.target_user.id)}
            onClose={(s) => setClosing({ report: r, status: s })}
          />
        ))}
        {reports.hasNextPage ? <Button title="Load more reports" variant="tertiary" loading={reports.isFetchingNextPage} onPress={() => void reports.fetchNextPage()} /> : null}
      </Stack>
      <MemberModerationDialog slug={place.slug} userId={acting} visible={!!acting} onClose={() => setActing(null)} />
      <CloseReportDialog slug={place.slug} target={closing} onClose={() => setClosing(null)} />
    </PlaceSettingsPage>
  );
}

function ReportCard({ place, report: r, channelName, canAct, onAct, onClose }: { place: Place; report: Report; channelName?: string; canAct: boolean; onAct: () => void; onClose: (status: 'resolved' | 'dismissed') => void }) {
  const theme = useTheme();
  const c = theme.colors;
  const where =
    r.target_type === 'message' ? (channelName ? `Message in #${channelName}` : r.message_id ? 'Message' : 'Deleted message') : r.target_type === 'post' ? (r.post_id ? 'Forum post' : 'Deleted post') : 'Member';
  const serious = r.reason === 'harassment' || r.reason === 'inappropriate';
  const context = r.target_type === 'post' && r.topic_id
    ? () => router.push({ pathname: '/places/[slug]/topics/[id]', params: { slug: place.slug, id: r.topic_id! } })
    : r.target_type === 'message' && r.channel_id && r.message_id
      ? () => router.push({ pathname: '/places/[slug]/channels/[id]', params: { slug: place.slug, id: r.channel_id! } })
      : null;

  return (
    <Card compact>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.space.sm }}>
        <Badge label={reportReasonLabel(r.reason)} tone={serious ? 'warning' : 'neutral'} />
        <Text variant="captionMd" tone="muted" style={{ flex: 1 }}>
          {where} · {relativeTime(r.created_at)} · reported by {r.reporter.display_name}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
        <Avatar name={r.target_user.display_name} uri={r.target_user.avatar_url} size={28} />
        <Text variant="bodySmStrong" tone="onDark">
          {r.target_user.display_name}
        </Text>
        <Text variant="captionMd" tone="muted">
          @{r.target_user.username}
        </Text>
      </View>
      {r.content_snapshot ? (
        <View style={{ padding: theme.space.md, borderRadius: theme.radii.md, backgroundColor: c.surfaceElevated, borderWidth: 1, borderColor: c.hairline }}>
          <Text variant="bodySm" numberOfLines={6} selectable>
            {r.content_snapshot}
          </Text>
        </View>
      ) : null}
      {r.details ? (
        <Text variant="bodySm" tone="muted" style={{ fontStyle: 'italic' }}>
          “{r.details}”
        </Text>
      ) : null}
      {r.status !== 'open' ? (
        <Text variant="captionMd" tone="muted">
          {REPORT_STATUS_LABELS[r.status]} {r.resolved_at ? relativeTime(r.resolved_at) : ''}
          {r.resolution_note ? ` · ${r.resolution_note}` : ''}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.space.sm }}>
        {context ? <Button title="Open in context" variant="outline" size="sm" onPress={context} /> : null}
        {canAct ? <Button title={`Act on ${r.target_user.display_name}…`} variant="tertiary" size="sm" onPress={onAct} /> : null}
        {r.status === 'open' ? (
          <>
            <View style={{ flex: 1 }} />
            <Button title="Dismiss" variant="tertiary" size="sm" onPress={() => onClose('dismissed')} />
            <Button title="Resolve" variant="outline" size="sm" onPress={() => onClose('resolved')} />
          </>
        ) : null}
      </View>
    </Card>
  );
}

function CloseReportDialog({ slug, target, onClose }: { slug: string; target: { report: Report; status: 'resolved' | 'dismissed' } | null; onClose: () => void }) {
  const theme = useTheme();
  const actions = useModerationActions(slug);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(target);
  if (target && target !== shown) {
    setShown(target);
    setNote('');
    setError(null);
  }
  const resolve = shown?.status === 'resolved';
  return (
    <Dialog visible={!!target} onClose={onClose}>
      <Text variant="headingMd" accessibilityRole="header">
        {resolve ? 'Resolve this report?' : 'Dismiss this report?'}
      </Text>
      <Text variant="bodySm" tone="muted">
        {resolve ? 'Use this when you have dealt with it.' : 'Use this when nothing needs doing.'} It moves out of the open queue and is recorded in the audit log.
      </Text>
      <TextField label="Note (optional)" value={note} onChangeText={setNote} maxLength={512} placeholder="What you did, for other moderators" />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: theme.space.sm }}>
        <Button title="Cancel" variant="tertiary" onPress={onClose} />
        <Button
          title={resolve ? 'Resolve' : 'Dismiss'}
          loading={busy}
          onPress={async () => {
            if (!shown) return;
            setBusy(true);
            setError(null);
            try {
              await actions.resolveReport(shown.report.id, shown.status, note);
              onClose();
            } catch (e) {
              setError(failureMessage(e, 'Could not update the report. Try again.'));
            } finally {
              setBusy(false);
            }
          }}
        />
      </View>
    </Dialog>
  );
}
