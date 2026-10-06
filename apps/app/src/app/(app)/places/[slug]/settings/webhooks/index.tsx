import { relativeTime, webhookHealth } from '@gotalk/core';
import { Badge, Button, ListCard, ListRow, Notice, Stack, Text } from '@gotalk/ui';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { PlaceSettingsPage, usePlaceSettings } from '@/components/place-settings';
import { SecretReveal } from '@/components/secret-reveal';
import { WebhookDialog } from '@/components/webhook-form';
import { useInstanceInfo } from '@/lib/api';
import { useWebhookActions, useWebhooks } from '@/lib/developer';

export default function Webhooks() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { place, access } = usePlaceSettings(slug);
  const instance = useInstanceInfo().data;
  const webhooks = useWebhooks(place?.slug, access.can('MANAGE_WEBHOOKS'));
  const actions = useWebhookActions(place?.slug);
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);

  if (!place) return null;
  if (!access.can('MANAGE_WEBHOOKS')) return <Redirect href={{ pathname: '/places/[slug]/settings', params: { slug: place.slug } }} />;
  const enabled = instance?.features.webhooks ?? true;
  const limit = instance?.limits.webhooks_per_place ?? 10;
  const events = instance?.webhooks.events ?? [];
  const atLimit = (webhooks.data?.length ?? 0) >= limit;

  return (
    <PlaceSettingsPage
      slug={place.slug}
      title="Webhooks"
      description={`Send signed events from ${place.name} to another service.`}
      actions={enabled ? <Button title="Create webhook" onPress={() => setCreating(true)} disabled={atLimit} /> : undefined}
    >
      <Stack gap="lg">
        {!enabled ? <Notice tone="warning">Webhooks are not enabled on this instance.</Notice> : null}
        {atLimit ? <Notice tone="warning">This place has reached the webhook limit of {limit}.</Notice> : null}
        {webhooks.isPending ? <ActivityIndicator /> : null}
        {webhooks.isError ? <Notice tone="danger">Webhooks could not be loaded.</Notice> : null}
        {webhooks.data?.length === 0 ? <Text variant="bodySm" tone="muted">No webhooks yet. Create one to send this place&apos;s events to a chat bridge, an archive or your own service.</Text> : null}
        {webhooks.data && webhooks.data.length > 0 ? (
          <ListCard>
            {webhooks.data.map((webhook) => {
              const health = webhookHealth(webhook);
              return (
                <ListRow
                  key={webhook.id}
                  icon="link"
                  title={webhook.name}
                  subtitle={`${webhook.url} · ${(webhook.events ?? []).length} events${webhook.last_delivery_at ? ` · last delivery ${relativeTime(webhook.last_delivery_at)}` : ''}`}
                  trailing={<Badge label={health.label} tone={health.tone} />}
                  chevron
                  onPress={() => router.push({ pathname: '/places/[slug]/settings/webhooks/[id]', params: { slug: place.slug, id: webhook.id } })}
                />
              );
            })}
          </ListCard>
        ) : null}
        <Text variant="captionMd" tone="muted">
          Each request is signed in the {instance?.webhooks.signature_header ?? 'Gotalk-Signature'} header. A delivery is tried up to {instance?.webhooks.max_attempts ?? 6} times; a webhook whose deliveries keep failing is turned off.
        </Text>
      </Stack>
      <WebhookDialog
        visible={creating}
        title="Create webhook"
        events={events}
        can={(p) => access.can(p)}
        onClose={() => setCreating(false)}
        onSubmit={async (input) => {
          const webhook = await actions.create({ name: input.name, url: input.url, events: input.events, active: input.active });
          setSecret(webhook.secret ?? null);
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
