import { Button, Notice, RadioOptions, Stack, Text, TextField, useTheme } from '@gotalk/ui';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { SettingsPage } from '@/components/settings-page';
import { useInstanceInfo, useMe } from '@/lib/api';
import { useAdminActions } from '@/lib/admin';
import { failureMessage } from '@/lib/failure';
import { useActiveInstance } from '@/lib/instances';

type Instance = NonNullable<ReturnType<typeof useInstanceInfo>['data']>;
type Mode = Instance['registration_mode'];

const MODES: { value: Mode; label: string; description: string }[] = [
  { value: 'open', label: 'Open', description: 'Anyone can sign up.' },
  { value: 'invite_only', label: 'Invite only', description: 'New accounts need an invite code from a member.' },
  { value: 'closed', label: 'Closed', description: 'Only administrators create accounts.' },
];

export default function InstanceSettings() {
  const me = useMe();
  const instance = useInstanceInfo();
  const host = useActiveInstance()?.origin.replace(/^https?:\/\//, '') ?? 'this instance';

  if (me.data && !me.data.is_instance_admin) return <Redirect href="/settings" />;
  const data = instance.data;
  return (
    <SettingsPage title="Instance settings" subtitle={`How ${host} presents itself. Changes show on the connect screen and to anyone who adds the instance.`} width={560}>
      {me.isPending || instance.isPending ? <ActivityIndicator /> : null}
      {instance.isError ? <Notice tone="danger">The instance settings could not be loaded. Try again in a moment.</Notice> : null}
      {data && me.data?.is_instance_admin ? <InstanceForm key={`${data.name}|${data.description}|${data.icon_url}|${data.registration_mode}`} data={data} /> : null}
    </SettingsPage>
  );
}

function InstanceForm({ data }: { data: Instance }) {
  const theme = useTheme();
  const actions = useAdminActions();
  const [name, setName] = useState(data.name);
  const [description, setDescription] = useState(data.description);
  const [icon, setIcon] = useState(data.icon_url ?? '');
  const [mode, setMode] = useState<Mode>(data.registration_mode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = name.trim() !== data.name || description.trim() !== data.description || icon.trim() !== (data.icon_url ?? '') || mode !== data.registration_mode;

  async function save() {
    if (!name.trim()) return setError('Give the instance a name.');
    if (icon.trim() && !/^https:\/\/\S+$/i.test(icon.trim())) return setError('The icon must be an https URL.');
    setSaving(true);
    setError(null);
    try {
      await actions.updateInstance({ name: name.trim(), description: description.trim(), icon_url: icon.trim(), registration_mode: mode });
    } catch (e) {
      setError(failureMessage(e, 'The instance settings could not be saved. Try again.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack gap="lg">
      <TextField label="Name" value={name} onChangeText={setName} maxLength={100} />
      <TextField label="Description" value={description} onChangeText={setDescription} multiline maxLength={1000} />
      <TextField label="Icon URL" value={icon} onChangeText={setIcon} autoCapitalize="none" autoCorrect={false} keyboardType="url" hint="An https image URL. Leave it empty for the initials icon." />
      <Stack gap="sm">
        <Text variant="bodySmStrong" tone="onDark">
          Who can create an account
        </Text>
        <RadioOptions options={MODES} value={mode} onChange={setMode} />
        {mode !== data.registration_mode && mode === 'closed' ? (
          <Text variant="captionMd" tone="muted">
            The sign-up form will explain that accounts are created by an administrator. People who already have accounts are not affected.
          </Text>
        ) : null}
      </Stack>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
        <Button title="Save changes" loading={saving} disabled={!dirty} onPress={save} />
        <Button
          title="Discard"
          variant="tertiary"
          disabled={!dirty || saving}
          onPress={() => {
            setName(data.name);
            setDescription(data.description);
            setIcon(data.icon_url ?? '');
            setMode(data.registration_mode);
            setError(null);
          }}
        />
      </View>
      <Text variant="captionMd" tone="muted">
        {data.stats.users.toLocaleString()} {data.stats.users === 1 ? 'person' : 'people'} · {data.stats.places.toLocaleString()} {data.stats.places === 1 ? 'place' : 'places'} · Gotalk {data.software.version} · API {data.api.version}
      </Text>
    </Stack>
  );
}
