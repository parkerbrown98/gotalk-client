import { describeInviteExpiry, describeInviteUses } from '@gotalk/core';
import { Button, ListCard, Notice, Stack, Text, useTheme } from '@gotalk/ui';
import * as Clipboard from 'expo-clipboard';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Platform, Share, View } from 'react-native';

import { CreateInviteDialog, useInviteLink } from '@/components/invite-dialog';
import { PlaceSettingsPage, usePlaceSettings } from '@/components/place-settings';
import { useSession } from '@/lib/auth';
import { useWide } from '@/lib/layout';
import { useInvites, usePlaceActions, type Invite } from '@/lib/places';

export default function PlaceInvites() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { place, access } = usePlaceSettings(slug);
  const session = useSession();
  const invites = useInvites(place?.slug, access.can('MANAGE_INVITES'));
  const [creating, setCreating] = useState(false);

  if (!place) return null;
  if (!access.can('MANAGE_INVITES')) return <Redirect href={{ pathname: '/places/[slug]/settings', params: { slug: place.slug } }} />;
  const canCreate = access.can('CREATE_INVITES');

  return (
    <PlaceSettingsPage
      slug={place.slug}
      title="Invites"
      description="Anyone with a link can join, up to the limits you set. Revoking a link stops it working right away."
      actions={canCreate ? <Button title="Create invite" onPress={() => setCreating(true)} /> : undefined}
    >
      <Stack gap="lg">
        {invites.isPending ? <ActivityIndicator /> : null}
        {invites.isError ? (
          <Notice tone="danger" title="Invites could not be loaded.">
            Try again in a moment.
          </Notice>
        ) : null}
        {invites.data && invites.data.length === 0 ? (
          <Text variant="bodySm" tone="muted">
            No active invites.
          </Text>
        ) : null}
        {invites.data && invites.data.length > 0 ? (
          <ListCard>
            {invites.data.map((invite) => (
              <InviteRow key={invite.code} invite={invite} slug={place.slug} mine={invite.created_by === session?.userId} />
            ))}
          </ListCard>
        ) : null}
        <Text variant="captionMd" tone="muted">
          Anyone with Create invites can make a link from the place menu, but only people with Manage invites see this list.
        </Text>
      </Stack>
      <CreateInviteDialog place={place} visible={creating} onClose={() => setCreating(false)} />
    </PlaceSettingsPage>
  );
}

function InviteRow({ invite, slug, mine }: { invite: Invite; slug: string; mine: boolean }) {
  const theme = useTheme();
  const wide = useWide();
  const actions = usePlaceActions();
  const link = useInviteLink(invite);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState(false);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md, padding: theme.space.md, paddingHorizontal: theme.space.lg }}>
      <Stack gap="none" style={{ flex: 1 }}>
        <Text variant="bodySm" tone="onDark" selectable style={{ fontFamily: Platform.OS === 'web' ? theme.fontFamilies.mono : 'monospace' }}>
          {invite.code}
        </Text>
        <Text variant="captionMd" tone="muted">
          {mine ? 'Created by you · ' : ''}
          {describeInviteUses(invite)} · {describeInviteExpiry(invite.expires_at)}
        </Text>
      </Stack>
      <Button
        title={copied ? 'Copied' : wide || Platform.OS === 'web' ? 'Copy link' : 'Share'}
        variant="outline"
        size="sm"
        onPress={async () => {
          if (!link) return;
          if (Platform.OS === 'web' || wide) {
            await Clipboard.setStringAsync(link);
            setCopied(true);
          } else await Share.share({ message: link });
        }}
      />
      <Button
        title="Revoke"
        variant="danger"
        size="sm"
        loading={revoking}
        onPress={async () => {
          setRevoking(true);
          try {
            await actions.revokeInvite(slug, invite.code);
          } finally {
            setRevoking(false);
          }
        }}
      />
    </View>
  );
}
