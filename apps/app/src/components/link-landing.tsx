import { ApiError } from '@gotalk/api-client';
import { serverParam } from '@gotalk/core';
import { Button, Notice, Stack, Text, useTheme } from '@gotalk/ui';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator } from 'react-native';

import { InstanceIcon } from '@/components/instance-summary';
import { ScreenFrame } from '@/components/screen-frame';
import { IndexedIndicator } from '@/components/search-index';
import { resetTo, useWide } from '@/lib/layout';
import { linkDestination, useLinkPreview, type LinkTarget } from '@/lib/links';
import { pendingLink } from '@/lib/pending-invite';
import { adoptServer, useServer, welcomeHref, type AccountTab } from '@/lib/welcome';

/** The frame every link screen shares: centred, like the invite screen. */
export function LinkFrame({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  const wide = useWide();
  return (
    <ScreenFrame
      title={title}
      onBack={() => (router.canGoBack() ? router.back() : resetTo('/'))}
      maxWidth={480}
      contentStyle={{ flexGrow: 1, justifyContent: 'center', padding: wide ? theme.space.xxl : theme.space.lg }}
    >
      {children}
    </ScreenFrame>
  );
}

const nounFor = (target: LinkTarget) => (target.kind === 'place' ? 'place' : 'topic');

/** "This link is not complete." for a link without a usable instance, code, address or topic ID. */
export function IncompleteLink({ target }: { target: LinkTarget }) {
  return (
    <LinkFrame title={target.kind === 'place' ? 'Place' : 'Topic'}>
      <Notice tone="danger" title="This link is not complete.">
        {`It needs the ${nounFor(target)} and the instance it is on. Ask the person who shared it for a new link.`}
      </Notice>
    </LinkFrame>
  );
}

/**
 * A place or topic link to an instance that isn't saved on this device: what it points to, then reading it
 * without an account (which saves the instance), or signing in or creating an account first. Like invites,
 * nothing is saved until one of those is chosen, and signing in carries on to the link.
 */
export function LinkLanding({ target, origin }: { target: LinkTarget; origin: string }) {
  const server = useServer(serverParam(origin));
  const found = server.data;
  const preview = useLinkPreview(target, found);
  const host = origin.replace(/^https?:\/\//, '');
  const noun = nounFor(target);
  const incompatible = found && !found.compatibility.ok ? found.compatibility.reason : null;

  function read() {
    if (!found) return;
    adoptServer(found);
    resetTo(linkDestination(target, false));
  }

  function account(tab: AccountTab) {
    pendingLink.set(target.kind === 'place' ? { kind: 'place', slug: target.slug, origin } : { kind: 'topic', topicId: target.topicId, origin });
    router.push(welcomeHref(found?.origin ?? origin, tab));
  }

  const accountButtons = (primary: boolean) => (
    <Stack gap="md">
      <Button title={`Sign in to ${host}`} variant={primary ? 'primary' : 'secondary'} onPress={() => account('sign-in')} />
      <Button title="Create an account" variant="tertiary" onPress={() => account('create')} />
    </Stack>
  );

  let body: ReactNode;
  if (server.isPending) {
    body = <ActivityIndicator />;
  } else if (server.isError || !found || incompatible) {
    body = (
      <Stack gap="md">
        <Notice tone="danger" title={incompatible ? "This instance isn't compatible with this app." : `Could not reach ${host}.`}>
          {incompatible ?? 'Check the link and your connection, then try again.'}
        </Notice>
        {incompatible ? null : <Button title="Try again" variant="tertiary" onPress={() => void server.refetch()} />}
      </Stack>
    );
  } else if (preview.isError) {
    const gone = preview.error instanceof ApiError && preview.error.status < 500;
    body = (
      <Stack gap="lg">
        <Notice tone="danger" title={gone ? `This ${noun} does not exist, or it is not public.` : `The ${noun} could not be loaded.`}>
          {gone ? `If you belong to it, sign in to ${host} to see it.` : 'Check your connection and try again.'}
        </Notice>
        {gone ? accountButtons(true) : <Button title="Try again" variant="tertiary" onPress={() => void preview.refetch()} />}
      </Stack>
    );
  } else if (!preview.data) {
    body = <ActivityIndicator />;
  } else {
    const { place, topic } = preview.data;
    const readable = place.visibility === 'public';
    const members = `${place.member_count.toLocaleString()} ${place.member_count === 1 ? 'member' : 'members'}`;
    body = (
      <Stack gap="xl">
        <Stack gap="lg" align="flex-start">
          <InstanceIcon name={place.name} iconUrl={place.icon_url} origin={found.origin} size={64} />
          <Stack gap="xs">
            <Text variant="headingXl" accessibilityRole="header">
              {topic ? topic.title : place.name}
            </Text>
            <Text variant="bodySm" tone="muted">
              {topic ? `${place.name} on ${host} · ${topic.reply_count} ${topic.reply_count === 1 ? 'reply' : 'replies'}` : `${host} · ${members}`}
            </Text>
            {place.indexed ? <IndexedIndicator /> : null}
          </Stack>
          {!topic && place.description ? (
            <Text variant="bodySm" tone="muted">
              {place.description}
            </Text>
          ) : null}
          <Text variant="bodySm" tone="muted">
            {readable
              ? `${host} isn't saved on this device yet. Reading adds it to your list of servers; signing in or creating an account does too.`
              : `${place.name} is by invitation. Sign in to ${host} to see it if you belong to it.`}
          </Text>
        </Stack>
        {readable ? (
          <Stack gap="md">
            <Button title={topic ? 'Read this topic' : `Open ${place.name}`} onPress={read} />
            {accountButtons(false)}
          </Stack>
        ) : (
          accountButtons(true)
        )}
      </Stack>
    );
  }

  return <LinkFrame title={target.kind === 'place' ? 'Place' : 'Topic'}>{body}</LinkFrame>;
}
