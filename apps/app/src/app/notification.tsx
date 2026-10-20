import { unwrap } from '@gotalk/api-client';
import { parsePushOpenParams, pushDestination } from '@gotalk/core';
import { useQuery } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator } from 'react-native';

import { useMarkPushRead } from '@/components/push-host';
import { useApiClient } from '@/lib/api';
import { instancesStore, useActiveInstance } from '@/lib/instances';
import { useLinkStep } from '@/lib/links';
import { welcomeHref } from '@/lib/welcome';

/**
 * Where a tapped push lands: `/notification?instance=<origin>&notification=…&place=…&channel=…`. Switches to the
 * push's instance, marks the notification read, and opens the conversation, channel message, topic or place it is
 * about (the inbox otherwise). A signed-out instance goes to sign in.
 */
export default function OpenNotification() {
  const params = useLocalSearchParams<Record<string, string>>();
  const parsed = parsePushOpenParams(params);
  const active = useActiveInstance();
  const step = useLinkStep(parsed?.instance);
  const switching = (step.kind === 'open' || step.kind === 'read') && active?.id !== step.instanceId;
  const ready = step.kind === 'open' && !switching;
  const destination = parsed ? pushDestination(parsed.target) : ({ kind: 'inbox' } as const);
  const placeId = destination.kind === 'channel' || destination.kind === 'place' ? destination.placeId : null;
  const client = useApiClient();

  const place = useQuery({
    queryKey: ['place-by-id', active?.id, placeId],
    enabled: ready && !!client && !!placeId,
    retry: false,
    queryFn: async () => unwrap(await client!.GET('/places/{place}', { params: { path: { place: placeId! } } })),
  });

  useEffect(() => {
    if (switching && (step.kind === 'open' || step.kind === 'read')) instancesStore.getState().setActive(step.instanceId);
  }, [switching, step]);

  useMarkPushRead(parsed?.notification ?? null, ready);

  if (!parsed || step.kind === 'incomplete') return <Redirect href="/" />;
  // The instance was removed from this device after the push was sent.
  if (step.kind === 'offer') return <Redirect href={welcomeHref(step.origin)} />;
  if (switching) return <ActivityIndicator style={{ flex: 1 }} />;
  if (step.kind === 'read') return <Redirect href={welcomeHref(parsed.instance)} />;

  switch (destination.kind) {
    case 'conversation':
      return (
        <Redirect
          href={{ pathname: '/messages/[id]', params: { id: destination.conversationId, ...(destination.messageId ? { jump: destination.messageId } : null) } }}
        />
      );
    case 'topic':
      // The topic link resolves the topic's place and handles a topic that is gone.
      return <Redirect href={{ pathname: '/topics/[id]', params: { id: destination.topicId } }} />;
    case 'channel':
    case 'place': {
      if (place.isError) return <Redirect href="/inbox" />;
      if (!place.data) return <ActivityIndicator style={{ flex: 1 }} />;
      const slug = place.data.slug;
      const href: Href =
        destination.kind === 'channel'
          ? { pathname: '/places/[slug]/channels/[id]', params: { slug, id: destination.channelId, ...(destination.messageId ? { jump: destination.messageId } : null) } }
          : { pathname: '/places/[slug]', params: { slug } };
      return <Redirect href={href} />;
    }
    default:
      return <Redirect href="/inbox" />;
  }
}
