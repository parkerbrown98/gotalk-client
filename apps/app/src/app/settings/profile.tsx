import { unwrap } from '@gotalk/api-client';
import { Button, Notice, Stack, TextField, useTheme } from '@gotalk/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { EmailStatus } from '@/components/email-status';
import { FailureNotice } from '@/components/failure-notice';
import { ImagePicker } from '@/components/image-picker';
import { SettingsPage } from '@/components/settings-page';
import { useApiClient, useMe } from '@/lib/api';
import { classifyFailure, type FailureKind } from '@/lib/failure';
import { useActiveInstance } from '@/lib/instances';
import { applySelfUpdate, useImageActions, useInstanceCapabilities } from '@/lib/uploads';

export default function Profile() {
  const theme = useTheme();
  const active = useActiveInstance();
  const client = useApiClient();
  const queryClient = useQueryClient();
  const me = useMe();
  const user = me.data;
  const caps = useInstanceCapabilities();
  const images = useImageActions();

  const [displayName, setDisplayName] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [bio, setBio] = useState('');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<FailureKind | null>(null);
  const [saved, setSaved] = useState(false);

  const reset = () => {
    setDisplayName(user?.display_name ?? '');
    setPronouns(user?.pronouns ?? '');
    setBio(user?.bio ?? '');
    setFailure(null);
  };
  // Load the form once per account; later refetches must not overwrite what is being typed.
  useEffect(reset, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!active) return null;
  if (!user) {
    return (
      <SettingsPage title="Profile" subtitle="This is what other members see on your posts and in chat.">
        {me.isError ? <FailureNotice failure={classifyFailure(me.error)} host={active.origin} /> : <ActivityIndicator />}
      </SettingsPage>
    );
  }

  const changes = {
    ...(displayName.trim() !== user.display_name ? { display_name: displayName.trim() } : {}),
    ...(pronouns !== user.pronouns ? { pronouns } : {}),
    ...(bio !== user.bio ? { bio } : {}),
  };
  const dirty = Object.keys(changes).length > 0;

  async function save() {
    if (!client || !dirty || pending || !displayName.trim()) return;
    setPending(true);
    setFailure(null);
    setSaved(false);
    try {
      const updated = unwrap(await client.PATCH('/users/@me', { body: changes }));
      await applySelfUpdate(queryClient, active!.id, updated);
      setSaved(true);
    } catch (e) {
      setFailure(classifyFailure(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <SettingsPage title="Profile" subtitle="This is what other members see on your posts and in chat.">
      <ImagePicker
        purpose="avatar"
        noun="photo"
        name={user.display_name}
        url={user.avatar_url}
        origin={active.origin}
        caps={caps}
        onUpload={images.setAvatar}
        onRemove={images.removeAvatar}
        onSetUrl={images.setAvatarUrl}
      />

      {saved && !dirty ? (
        <Notice tone="success" title="Saved.">
          Your profile is up to date.
        </Notice>
      ) : null}
      <FailureNotice failure={failure} host={active.origin} />

      <Stack gap="lg">
        <TextField
          label="Display name"
          value={displayName}
          onChangeText={(v) => {
            setDisplayName(v);
            setSaved(false);
          }}
          error={displayName.trim() ? null : 'Enter a name.'}
          maxLength={64}
        />
        <TextField label="Username" value={user.username} editable={false} hint="Usernames cannot be changed." style={{ color: theme.colors.mute }} />
        <EmailStatus user={user} onRefresh={() => void me.refetch()} />
        <TextField
          label="Pronouns"
          value={pronouns}
          onChangeText={(v) => {
            setPronouns(v);
            setSaved(false);
          }}
          maxLength={32}
        />
        <TextField
          label="Bio"
          value={bio}
          onChangeText={(v) => {
            setBio(v);
            setSaved(false);
          }}
          multiline
          maxLength={500}
        />
      </Stack>

      <Stack direction="row" gap="sm">
        <Button title="Save changes" onPress={save} loading={pending} disabled={!dirty || !displayName.trim()} />
        <Button title="Discard" variant="tertiary" onPress={reset} disabled={!dirty || pending} />
      </Stack>
    </SettingsPage>
  );
}
