import { BAN_DURATIONS, banExpiry, relativeTime } from '@gotalk/core';
import { Avatar, Button, Dialog, ListCard, Notice, PillTabs, Stack, Text, TextField, useTheme } from '@gotalk/ui';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { PlaceSettingsPage, usePlaceSettings } from '@/components/place-settings';
import { useApiClient } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { failureMessage } from '@/lib/failure';
import { lookUpUser, useBans, useModerationActions, type Ban } from '@/lib/moderation';

export default function Bans() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { place, access } = usePlaceSettings(slug);
  const allowed = access.can('BAN_MEMBERS');
  const bans = useBans(place?.slug, allowed);
  const [unbanning, setUnbanning] = useState<Ban | null>(null);
  const [banning, setBanning] = useState(false);

  if (!place) return null;
  if (!allowed) return <Redirect href={{ pathname: '/places/[slug]/settings', params: { slug: place.slug } }} />;
  const list = bans.data?.pages.flatMap((p) => p.items ?? []) ?? [];

  return (
    <PlaceSettingsPage
      slug={place.slug}
      title="Bans"
      description="People who cannot join this place. Lifting a ban lets them join again; it does not invite them back."
      actions={<Button title="Ban by username" variant="tertiary" onPress={() => setBanning(true)} />}
    >
      <Stack gap="lg">
        {bans.isPending ? <ActivityIndicator /> : null}
        {bans.isError ? (
          <Notice tone="danger" title="Bans could not be loaded.">
            Check your connection and try again.
          </Notice>
        ) : null}
        {bans.isSuccess && list.length === 0 ? (
          <Text variant="bodySm" tone="muted">
            Nobody is banned.
          </Text>
        ) : null}
        {list.length > 0 ? (
          <ListCard>
            {list.map((b) => (
              <BanRow key={b.user.id} ban={b} onUnban={() => setUnbanning(b)} />
            ))}
          </ListCard>
        ) : null}
        {bans.hasNextPage ? <Button title="Load more" variant="tertiary" loading={bans.isFetchingNextPage} onPress={() => void bans.fetchNextPage()} /> : null}
      </Stack>
      <UnbanDialog slug={place.slug} ban={unbanning} onClose={() => setUnbanning(null)} />
      <BanByNameDialog slug={place.slug} placeName={place.name} visible={banning} onClose={() => setBanning(false)} />
    </PlaceSettingsPage>
  );
}

function BanRow({ ban, onUnban }: { ban: Ban; onUnban: () => void }) {
  const theme = useTheme();
  const myId = useSession()?.userId;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md, paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md }}>
      <Avatar name={ban.user.display_name} uri={ban.user.avatar_url} size={36} />
      <Stack gap="none" style={{ flex: 1 }}>
        <Text variant="bodySmStrong" tone="onDark">
          {ban.user.display_name}
        </Text>
        <Text variant="captionMd" tone="muted">
          @{ban.user.username} · banned {relativeTime(ban.created_at)}
          {ban.banned_by && ban.banned_by === myId ? ' by you' : ''} · {banExpiry(ban.expires_at)}
        </Text>
        {ban.reason ? (
          <Text variant="captionMd" tone="muted" style={{ fontStyle: 'italic' }}>
            “{ban.reason}”
          </Text>
        ) : null}
      </Stack>
      <Button title="Unban" variant="outline" size="sm" onPress={onUnban} />
    </View>
  );
}

function UnbanDialog({ slug, ban, onClose }: { slug: string; ban: Ban | null; onClose: () => void }) {
  const theme = useTheme();
  const actions = useModerationActions(slug);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(ban);
  if (ban && ban !== shown) {
    setShown(ban);
    setError(null);
  }
  return (
    <Dialog visible={!!ban} onClose={onClose}>
      <Text variant="headingMd" accessibilityRole="header">
        Lift the ban on {shown?.user.display_name}?
      </Text>
      <Text variant="bodySm" tone="muted">
        They can join again the usual way. They are not told, and they are not added back.
      </Text>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: theme.space.sm }}>
        <Button title="Keep the ban" variant="tertiary" onPress={onClose} />
        <Button
          title="Unban"
          loading={busy}
          onPress={async () => {
            if (!shown) return;
            setBusy(true);
            setError(null);
            try {
              await actions.unban(shown.user.id);
              onClose();
            } catch (e) {
              setError(failureMessage(e, 'Could not lift the ban. Try again.'));
            } finally {
              setBusy(false);
            }
          }}
        />
      </View>
    </Dialog>
  );
}

/** Banning someone who is not a member yet, for example ahead of a raid. */
function BanByNameDialog({ slug, placeName, visible, onClose }: { slug: string; placeName: string; visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const client = useApiClient();
  const actions = useModerationActions(slug);
  const [username, setUsername] = useState('');
  const [seconds, setSeconds] = useState('0');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setUsername('');
    setReason('');
    setSeconds('0');
    setError(null);
    onClose();
  }

  return (
    <Dialog visible={visible} onClose={close}>
      <Text variant="headingMd" accessibilityRole="header">
        Ban by username
      </Text>
      <Text variant="bodySm" tone="muted">
        Stops someone on this instance joining {placeName}. If they are a member, they are removed.
      </Text>
      <TextField label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} placeholder="@username" autoFocus />
      <Stack gap="xs">
        <Text variant="bodySmStrong" tone="onDark">
          Duration
        </Text>
        <PillTabs options={BAN_DURATIONS.map((d) => ({ value: String(d.seconds), label: d.label }))} value={seconds} onChange={setSeconds} />
      </Stack>
      <TextField label="Reason" value={reason} onChangeText={setReason} maxLength={512} placeholder="Recorded in the audit log (optional)" />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: theme.space.sm }}>
        <Button title="Cancel" variant="tertiary" onPress={close} />
        <Button
          title="Ban"
          variant="danger"
          loading={busy}
          disabled={!username.trim()}
          onPress={async () => {
            setBusy(true);
            setError(null);
            try {
              const user = await lookUpUser(client, username).catch(() => null);
              if (!user) {
                setError(`Nobody called ${username.trim()} on this instance.`);
                return;
              }
              await actions.ban(user.id, Number(seconds), reason.trim());
              close();
            } catch (e) {
              setError(failureMessage(e, 'Could not ban them. Try again.'));
            } finally {
              setBusy(false);
            }
          }}
        />
      </View>
    </Dialog>
  );
}
