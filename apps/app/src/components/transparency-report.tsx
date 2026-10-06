import { breakdownRows, reportReasonLabel, REPORT_STATUS_LABELS, transparencyActionLabel } from '@gotalk/core';
import { Badge, Button, Card, ListCard, Notice, PillTabs, Stack, Text, useTheme } from '@gotalk/ui';
import { ActivityIndicator, View } from 'react-native';

import { useTransparency } from '@/lib/developer';

const PERIODS = [
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '12 months' },
] as const;

function totalActions(actions: Record<string, number> | null | undefined): number {
  return Object.values(actions ?? {}).reduce((sum, count) => sum + count, 0);
}

function BarRow({ label, count, share }: { label: string; count: number; share: number }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
      <Text variant="captionMd" tone="muted" style={{ width: 120 }}>
        {label}
      </Text>
      <View style={{ flex: 1, height: 8, borderRadius: theme.radii.full, backgroundColor: theme.colors.surfaceElevated, overflow: 'hidden' }}>
        <View style={{ width: `${Math.max(3, Math.min(100, share * 100))}%`, height: '100%', backgroundColor: theme.colors.onDarkMute }} />
      </View>
      <Text variant="captionMd" tone="muted" style={{ width: 36, textAlign: 'right' }}>
        {count}
      </Text>
    </View>
  );
}

export function TransparencyReport({
  place,
  description,
  days,
  onDaysChange,
}: {
  place?: string;
  description: string;
  days: '30' | '90' | '365';
  onDaysChange: (days: '30' | '90' | '365') => void;
}) {
  const theme = useTheme();
  const report = useTransparency(Number(days), place);
  const data = report.data;
  const actionRows = breakdownRows(data?.actions ?? {}, transparencyActionLabel);
  const reasonRows = breakdownRows(data?.reports.by_reason ?? {}, reportReasonLabel);
  const statusRows = breakdownRows(data?.reports.by_status ?? {}, (s) => REPORT_STATUS_LABELS[s as keyof typeof REPORT_STATUS_LABELS] ?? s);

  return (
    <Stack gap="lg">
      <Text variant="bodySm" tone="muted">
        {description}
      </Text>
      <PillTabs options={PERIODS} value={days} onChange={onDaysChange} />
      {report.isPending ? <ActivityIndicator /> : null}
      {report.isError ? (
        <Notice tone="danger" title="Transparency report could not be loaded.">
          Try again in a moment.
        </Notice>
      ) : null}
      {data ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.md }}>
            <Card compact style={{ minWidth: 150, flex: 1 }}>
              <Text variant="headingLg" tone="onDark">
                {data.reports.total.toLocaleString()}
              </Text>
              <Text variant="captionMd" tone="muted">
                Reports filed
              </Text>
            </Card>
            <Card compact style={{ minWidth: 150, flex: 1 }}>
              <Text variant="headingLg" tone="onDark">
                {totalActions(data.actions).toLocaleString()}
              </Text>
              <Text variant="captionMd" tone="muted">
                Actions taken
              </Text>
            </Card>
            <Card compact style={{ minWidth: 150, flex: 1 }}>
              <Text variant="headingLg" tone="onDark">
                {data.content_removed.toLocaleString()}
              </Text>
              <Text variant="captionMd" tone="muted">
                Content removed
              </Text>
            </Card>
          </View>
          <ListCard>
            <Stack gap="md" style={{ padding: theme.space.lg }}>
              <Text variant="bodySmStrong" tone="onDark">
                Reports by reason
              </Text>
              {reasonRows.length ? reasonRows.map((row) => <BarRow key={row.label} label={row.label} count={row.count} share={row.share} />) : <Text variant="captionMd" tone="muted">No reports in this period.</Text>}
            </Stack>
          </ListCard>
          <ListCard>
            <Stack gap="sm" style={{ padding: theme.space.lg }}>
              <Text variant="bodySmStrong" tone="onDark">
                Reports by status
              </Text>
              <Stack direction="row" wrap gap="sm">
                {statusRows.length ? statusRows.map((row) => <Badge key={row.label} label={`${row.label} ${row.count}`} />) : <Text variant="captionMd" tone="muted">No reports in this period.</Text>}
              </Stack>
            </Stack>
          </ListCard>
          <ListCard>
            <Stack gap="sm" style={{ padding: theme.space.lg }}>
              <Text variant="bodySmStrong" tone="onDark">
                Actions taken
              </Text>
              <Stack direction="row" wrap gap="sm">
                {actionRows.length ? actionRows.map((row) => <Badge key={row.label} label={`${row.label} ${row.count}`} />) : <Text variant="captionMd" tone="muted">No moderation actions in this period.</Text>}
              </Stack>
            </Stack>
          </ListCard>
          <Text variant="captionMd" tone="muted">
            Covers {new Date(data.since).toLocaleDateString()} through {new Date(data.until).toLocaleDateString()}.
          </Text>
        </>
      ) : null}
      {report.isError ? <Button title="Retry" variant="outline" onPress={() => report.refetch()} /> : null}
    </Stack>
  );
}
