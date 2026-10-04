import { describeInviteExpiry, describeInviteUses } from '@gotalk/core';
import { Button, Dialog, ListCard, Notice, PillTabs, Stack, Text, TextField, useTheme } from '@gotalk/ui';
import * as Clipboard from 'expo-clipboard';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Platform, Share, View } from 'react-native';

import { CreateInviteDialog, useInviteLink } from '@/components/invite-dialog';
import { PlaceForm } from '@/components/place-form';
import { ScreenFrame } from '@/components/screen-frame';
import { useSession } from '@/lib/auth';
import { classifyFailure } from '@/lib/failure';
import { goBack, resetTo, useWide } from '@/lib/layout';
import { useInvites, usePlace, usePlaceAccess, usePlaceActions, type Invite, type Place } from '@/lib/places';

type Tab = 'general' | 'invites';

export default function PlaceSettings() {
  const theme = useTheme();
  const wide = useWide();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const place = usePlace(slug).data;
  const access = usePlaceAccess(place);
  const [tab, setTab] = useState<Tab>('general');

  if (!place) return <ActivityIndicator style={{ flex: 1 }} />;
  const canGeneral = access.can('MANAGE_PLACE');
  const canInvites = access.can('MANAGE_INVITES');
  if (!access.isMember || (!canGeneral && !canInvites)) return <Redirect href={{ pathname: '/places/[slug]', params: { slug: place.slug } }} />;

  const tabs = [...(canGeneral ? [{ value: 'general' as const, label: 'General' }] : []), ...(canInvites ? [{ value: 'invites' as const, label: 'Invites' }] : [])];
  const current: Tab = tabs.some((t) => t.value === tab) ? tab : tabs[0]!.value;

  return (
    <ScreenFrame
      title="Place settings"
      onBack={() => goBack({ pathname: '/places/[slug]', params: { slug: place.slug } })}
      maxWidth={680}
      contentStyle={wide ? { paddingVertical: theme.space.xxl, paddingHorizontal: 40 } : { padding: theme.space.lg }}
    >
      <Stack gap="xl">
        <Stack gap="sm">
          {wide ? (
            <Text variant="headingXl" accessibilityRole="header">
              Place settings
            </Text>
          ) : null}
          {tabs.length > 1 ? <PillTabs options={tabs} value={current} onChange={setTab} /> : null}
        </Stack>
        {current === 'general' ? <General place={place} isOwner={access.isOwner} /> : <Invites place={place} canCreate={access.can('CREATE_INVITES')} />}
      </Stack>
    </ScreenFrame>
  );
}

function General({ place, isOwner }: { place: Place; isOwner: boolean }) {
  const theme = useTheme();
  const actions = usePlaceActions();
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      await actions.remove(place.slug);
      setConfirm(false);
      resetTo('/home');
    } catch (e) {
      const f = classifyFailure(e);
      setError(f.kind === 'rejected' ? f.message : 'The place could not be deleted. Try again.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Stack gap="xl">
      <PlaceForm
        key={place.id}
        initial={{ name: place.name, slug: place.slug, description: place.description, visibility: place.visibility }}
        submitLabel="Save changes"
        secondaryLabel="Discard"
        slugHint="Changing it breaks links people already have."
        onSubmit={async (values) => {
          const updated = await actions.update(place.slug, values);
          if (updated.slug !== place.slug) resetTo({ pathname: '/places/[slug]/settings', params: { slug: updated.slug } });
        }}
        onSecondary={() => resetTo({ pathname: '/places/[slug]/settings', params: { slug: place.slug } })}
      />
      {isOwner ? (
        <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.hairline, paddingTop: theme.space.lg, gap: theme.space.md }}>
          <Stack gap="none">
            <Text variant="bodySmStrong" tone="onDark">
              Delete this place
            </Text>
            <Text variant="captionMd" tone="muted">
              Removes it for every member. Only the owner can do this.
            </Text>
          </Stack>
          <Button title="Delete place" variant="danger" onPress={() => setConfirm(true)} style={{ alignSelf: 'flex-start' }} />
        </View>
      ) : null}
      <Dialog visible={confirm} onClose={() => setConfirm(false)}>
        <Text variant="headingMd" accessibilityRole="header">
          Delete {place.name}?
        </Text>
        <Text variant="bodySm" tone="muted">
          This removes the place for all {place.member_count.toLocaleString()} {place.member_count === 1 ? 'member' : 'members'}, along with its forums and chat. It cannot be undone.
        </Text>
        <TextField label={`Type ${place.name} to confirm`} value={typed} onChangeText={setTyped} autoCapitalize="none" autoCorrect={false} />
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: theme.space.sm }}>
          <Button title="Keep this place" variant="tertiary" onPress={() => setConfirm(false)} />
          <Button title="Delete place" variant="danger" onPress={remove} loading={deleting} disabled={typed.trim() !== place.name} />
        </View>
      </Dialog>
    </Stack>
  );
}

function Invites({ place, canCreate }: { place: Place; canCreate: boolean }) {
  const theme = useTheme();
  const wide = useWide();
  const session = useSession();
  const invites = useInvites(place.slug, true);
  const [creating, setCreating] = useState(false);

  return (
    <Stack gap="lg">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.space.lg }}>
        <Stack gap="xs" style={{ flex: 1 }}>
          {wide ? (
            <Text variant="headingMd" accessibilityRole="header">
              Invites
            </Text>
          ) : null}
          <Text variant="bodySm" tone="muted">
            Anyone with a link can join, up to the limits you set. Revoking a link stops it working right away.
          </Text>
        </Stack>
        {canCreate ? <Button title="Create invite" onPress={() => setCreating(true)} /> : null}
      </View>
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
      <CreateInviteDialog place={place} visible={creating} onClose={() => setCreating(false)} />
    </Stack>
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
      <Button title="Revoke" variant="danger" size="sm" loading={revoking} onPress={async () => {
        setRevoking(true);
        try {
          await actions.revokeInvite(slug, invite.code);
        } finally {
          setRevoking(false);
        }
      }} />
    </View>
  );
}
