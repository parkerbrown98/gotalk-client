import { ApiError } from '@gotalk/api-client';
import { isTopicId } from '@gotalk/core';
import { Button, Notice, Stack } from '@gotalk/ui';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator } from 'react-native';

import { IncompleteLink, LinkFrame, LinkLanding } from '@/components/link-landing';
import { instancesStore, useActiveInstance } from '@/lib/instances';
import { resetTo } from '@/lib/layout';
import { linkDestination, useLinkStep, useTopicPlace, type LinkTarget } from '@/lib/links';

/**
 * Opened from a topic link: `/topics/<id>?instance=<origin>` on the web, `gotalk://topics/<id>?…` in the apps,
 * for example the public index's "Open in Gotalk". Signed in on that instance, it opens the topic in its
 * place; signed out, the public reading view; on an instance not saved here, it offers to add it first.
 */
export default function TopicLink() {
  const { id, instance } = useLocalSearchParams<{ id: string; instance?: string }>();
  const active = useActiveInstance();
  // Without an instance the link means the one in use, like an invite link.
  const step = useLinkStep(instance ?? active?.origin);
  const valid = isTopicId(id ?? '');
  const target: LinkTarget = { kind: 'topic', topicId: (id ?? '').toLowerCase() };
  const switching = (step.kind === 'open' || step.kind === 'read') && active?.id !== step.instanceId;
  const resolved = useTopicPlace(target.topicId, valid && step.kind === 'open' && !switching);

  useEffect(() => {
    if (valid && switching && (step.kind === 'open' || step.kind === 'read')) instancesStore.getState().setActive(step.instanceId);
  }, [valid, switching, step]);

  if (!valid || step.kind === 'incomplete') return <IncompleteLink target={target} />;
  if (step.kind === 'offer') return <LinkLanding target={target} origin={step.origin} />;
  if (switching) return <ActivityIndicator style={{ flex: 1 }} />;
  if (step.kind === 'read') return <Redirect href={linkDestination(target, false)} />;
  if (resolved.data) return <Redirect href={linkDestination(target, true, resolved.data.place.slug)} />;
  if (resolved.isError) {
    const gone = resolved.error instanceof ApiError && resolved.error.status < 500;
    return (
      <LinkFrame title="Topic">
        <Stack gap="md">
          <Notice tone="danger" title={gone ? 'This topic does not exist, or you cannot see it.' : 'The topic could not be loaded.'}>
            {gone ? 'It may have been deleted, or it is in a place you do not belong to.' : 'Check your connection and try again.'}
          </Notice>
          {gone ? (
            <Button title="Go home" variant="tertiary" onPress={() => resetTo('/feed')} />
          ) : (
            <Button title="Try again" variant="tertiary" onPress={() => void resolved.refetch()} />
          )}
        </Stack>
      </LinkFrame>
    );
  }
  return <ActivityIndicator style={{ flex: 1 }} />;
}
