import { deliveryStatus, relativeTime, webhookHealth } from '@gotalk/core';
import { Badge, Button, Card, Dialog, hoverTransition, Icon, ListCard, Notice, PillTabs, Stack, Text, useTheme, type PressState } from '@gotalk/ui';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, View } from 'react-native';

import { PlaceSettingsPage, sectionHref, usePlaceSettings } from '@/components/place-settings';
import { SecretReveal } from '@/components/secret-reveal';
import { WebhookDialog } from '@/components/webhook-form';
import { useInstanceInfo } from '@/lib/api';
import { useWebhook, useWebhookActions, useWebhookDeliveries, type WebhookDelivery, type WebhookDeliveryStatus } from '@/lib/developer';
import { failureMessage } from '@/lib/failure';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'succeeded', label: 'Succeeded' },
  { value: 'failed', label: 'Failed' },
] as const;

export default function WebhookDetail() {
  const { slug, id } = useLocalSearchParams<{ slug: string; id: string }>();
  const { place, access } = usePlaceSettings(slug);
  const instance = useInstanceInfo().data;
  const webhook = useWebhook(id, access.can('MANAGE_WEBHOOKS'));
  const [filter, setFilter] = useState<WebhookDeliveryStatus | 'all'>('all');
  const deliveries = useWebhookDeliveries(id, filter, access.can('MANAGE_WEBHOOKS'));
  const actions = useWebhookActions(place?.slug, id);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<'delete' | 'rotate' | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const data = webhook.data;

  if (!place) return null;
  if (!access.can('MANAGE_WEBHOOKS')) return <Redirect href={{ pathname: '/places/[slug]/settings', params: { slug: place.slug } }} />;
  const events = instance?.webhooks.events ?? [];
  const health = data ? webhookHealth(data) : null;
  const items = deliveries.data?.pages.flatMap((p) => p.items ?? []) ?? [];

  return (
    <PlaceSettingsPage
      slug={place.slug}
      title={data?.name ?? 'Webhook'}
      description={data?.url}
      back={{ label: 'Webhooks', href: sectionHref(place.slug, 'webhooks') }}
      actions={
        data ? (
          <Stack direction="row" gap="sm" wrap>
            <Button title="Send ping" variant="tertiary" size="sm" onPress={async () => { try { await actions.ping(); } catch (e) { setActionError(failureMessage(e, 'The ping could not be sent.')); } }} />
            <Button title="Rotate secret" variant="tertiary" size="sm" onPress={() => setConfirm('rotate')} />
            <Button title="Delete" variant="danger" size="sm" onPress={() => setConfirm('delete')} />
          </Stack>
        ) : undefined
      }
      width={760}
    >
      <Stack gap="lg">
        {webhook.isPending ? <ActivityIndicator /> : null}
        {webhook.isError ? <Notice tone="danger">Webhook could not be loaded.</Notice> : null}
        {actionError ? <Notice tone="danger">{actionError}</Notice> : null}
        {data ? (
          <>
            <Card>
              <Stack direction="row" align="center" gap="md">
                <Text variant="bodySmStrong" tone="onDark" style={{ flex: 1 }}>
                  Settings
                </Text>
                {health ? <Badge label={health.label} tone={health.tone} /> : null}
                <Button title="Edit" variant="outline" size="sm" onPress={() => setEditing(true)} />
              </Stack>
              <Text variant="captionMd" tone="muted">
                {(data.events ?? []).join(', ')}
              </Text>
              {!data.active && data.disabled_reason ? (
                <Notice tone="warning" title="Turned off">
                  {data.disabled_reason}. Fix the endpoint, then edit the webhook and turn it back on.
                </Notice>
              ) : null}
              {data.last_success_at ? (
                <Text variant="captionMd" tone="muted">
                  Last success {relativeTime(data.last_success_at)}
                </Text>
              ) : null}
            </Card>
            <PillTabs options={FILTERS} value={filter} onChange={setFilter} />
            {deliveries.isPending ? <ActivityIndicator /> : null}
            {deliveries.isError ? <Notice tone="danger">Deliveries could not be loaded.</Notice> : null}
            {items.length ? (
              <ListCard>
                {items.map((delivery) => (
                  <DeliveryRow
                    key={delivery.id}
                    delivery={delivery}
                    onRedeliver={async () => {
                      setActionError(null);
                      try {
                        await actions.redeliver(delivery.id);
                      } catch (e) {
                        setActionError(failureMessage(e, 'The delivery could not be queued again.'));
                      }
                    }}
                  />
                ))}
              </ListCard>
            ) : deliveries.isSuccess ? (
              <Text variant="bodySm" tone="muted">
                {filter === 'all' ? 'Nothing sent yet. Send a ping to check the endpoint.' : `No ${filter} deliveries.`}
              </Text>
            ) : null}
            {deliveries.hasNextPage ? <Button title="Load more" variant="outline" onPress={() => deliveries.fetchNextPage()} loading={deliveries.isFetchingNextPage} /> : null}
          </>
        ) : null}
      </Stack>
      {data ? (
        <WebhookDialog
          visible={editing}
          title="Edit webhook"
          events={events}
          initial={{ name: data.name, url: data.url, events: data.events ?? [], active: data.active }}
          can={(p) => access.can(p)}
          onClose={() => setEditing(false)}
          onSubmit={async (input) => {
            await actions.update({ name: input.name, url: input.url, events: input.events, active: input.active });
          }}
        />
      ) : null}
      <ConfirmDialog
        kind={confirm}
        name={data?.name ?? 'this webhook'}
        onClose={() => setConfirm(null)}
        onDelete={async () => {
          await actions.remove();
          router.replace(sectionHref(place.slug, 'webhooks'));
        }}
        onRotate={async () => {
          const updated = await actions.rotateSecret();
          setSecret(updated.secret ?? null);
        }}
      />
      <SecretReveal
        visible={!!secret}
        title="Copy the signing secret now"
        secret={secret}
        description={`Verify each request with the ${instance?.webhooks.signature_header ?? 'signature'} header.`}
        onClose={() => setSecret(null)}
      />
    </PlaceSettingsPage>
  );
}

function DeliveryRow({ delivery, onRedeliver }: { delivery: WebhookDelivery; onRedeliver: () => Promise<void> }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const status = deliveryStatus(delivery);
  const mono = { fontFamily: Platform.OS === 'web' ? theme.fontFamilies.mono : 'monospace' };
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${delivery.event}, ${status.label}. ${open ? 'Hide' : 'Show'} details`}
        onPress={() => setOpen((o) => !o)}
        style={({ pressed, hovered }: PressState) => ({ ...hoverTransition, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.space.sm, paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md, backgroundColor: pressed || hovered ? theme.colors.surfaceElevated : 'transparent' })}
      >
        <Text variant="bodySm" tone="onDark" style={[mono, { flex: 1, minWidth: 120 }]}>
          {delivery.event}
        </Text>
        <Badge label={status.label} tone={status.tone} />
        <Text variant="captionMd" tone="muted">
          {[delivery.duration_ms != null ? `${delivery.duration_ms} ms` : null, `${delivery.attempts} ${delivery.attempts === 1 ? 'attempt' : 'attempts'}`, relativeTime(delivery.created_at)].filter(Boolean).join(' · ')}
        </Text>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} color={theme.colors.mute} />
      </Pressable>
      {open ? (
        <View style={{ paddingHorizontal: theme.space.lg, paddingBottom: theme.space.md, gap: theme.space.sm }}>
          {delivery.error ? (
            <Text variant="captionMd">
              <Text variant="captionMd" tone="muted">
                Error:{' '}
              </Text>
              {delivery.error}
            </Text>
          ) : null}
          <ScrollView horizontal style={{ maxHeight: 240, borderRadius: theme.radii.md, borderWidth: 1, borderColor: theme.colors.hairline, backgroundColor: theme.colors.surfaceElevated }} contentContainerStyle={{ padding: theme.space.md }}>
            <Text selectable variant="captionMd" style={mono}>
              {JSON.stringify(delivery.payload, null, 2)}
            </Text>
          </ScrollView>
          {delivery.status !== 'pending' ? (
            <Button
              title="Redeliver"
              variant="outline"
              size="sm"
              loading={busy}
              style={{ alignSelf: 'flex-start' }}
              onPress={async () => {
                setBusy(true);
                try {
                  await onRedeliver();
                } finally {
                  setBusy(false);
                }
              }}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function ConfirmDialog({ kind, name, onClose, onDelete, onRotate }: { kind: 'delete' | 'rotate' | null; name: string; onClose: () => void; onDelete: () => Promise<void>; onRotate: () => Promise<void> }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!kind) return null;
  const rotate = kind === 'rotate';
  return (
    <Dialog visible={!!kind} onClose={onClose}>
      <Text variant="headingMd" accessibilityRole="header">
        {rotate ? 'Rotate signing secret?' : `Delete ${name}?`}
      </Text>
      <Text variant="bodySm" tone="muted">
        {rotate ? 'Requests signed with the old secret will no longer verify. Copy the new secret before closing the next dialog.' : 'This deletes the webhook and its delivery log. It cannot be undone.'}
      </Text>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Stack direction="row" justify="flex-end">
        <Button title="Cancel" variant="tertiary" onPress={onClose} />
        <Button
          title={rotate ? 'Rotate secret' : 'Delete webhook'}
          variant={rotate ? 'primary' : 'danger'}
          loading={pending}
          onPress={async () => {
            setPending(true);
            setError(null);
            try {
              if (rotate) await onRotate();
              else await onDelete();
              onClose();
            } catch (e) {
              setError(failureMessage(e, rotate ? 'The secret could not be rotated.' : 'The webhook could not be deleted.'));
            } finally {
              setPending(false);
            }
          }}
        />
      </Stack>
    </Dialog>
  );
}
