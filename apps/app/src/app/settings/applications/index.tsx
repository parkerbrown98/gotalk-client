import { Avatar, Button, Checkbox, Dialog, ListCard, ListRow, Notice, Stack, Text, TextField } from '@gotalk/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { SecretReveal } from '@/components/secret-reveal';
import { SettingsPage } from '@/components/settings-page';
import { useInstanceInfo } from '@/lib/api';
import { useApplicationActions, useApplications } from '@/lib/developer';
import { failureMessage } from '@/lib/failure';

export default function Applications() {
  const applications = useApplications();
  const actions = useApplicationActions();
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ id: string; token: string } | null>(null);
  const limit = useInstanceInfo().data?.limits.applications_per_user ?? 25;
  const atLimit = (applications.data?.length ?? 0) >= limit;
  return (
    <SettingsPage title="Applications" subtitle="An application has a bot account that can join places, answer slash commands and use the API.">
      <Stack gap="lg">
        <Button title="New application" onPress={() => setCreating(true)} disabled={atLimit} style={{ alignSelf: 'flex-start' }} />
        {atLimit ? <Notice tone="warning">You have {limit} applications, the most this instance allows. Delete one to make another.</Notice> : null}
        {applications.isPending ? <ActivityIndicator /> : null}
        {applications.isError ? (
          <Notice tone="danger" title="Applications could not be loaded.">
            Try again in a moment.
          </Notice>
        ) : null}
        {applications.data?.length === 0 ? (
          <Text variant="bodySm" tone="muted">
            No applications yet.
          </Text>
        ) : null}
        {applications.data && applications.data.length > 0 ? (
          <ListCard>
            {applications.data.map((app) => (
              <ListRow
                key={app.id}
                leading={<Avatar name={app.name} uri={app.icon_url} size={36} />}
                title={app.name}
                subtitle={`@${app.bot.username} · ${app.is_public ? 'Public' : 'Private'}`}
                chevron
                onPress={() => router.push({ pathname: '/settings/applications/[id]', params: { id: app.id } })}
              />
            ))}
          </ListCard>
        ) : null}
      </Stack>
      <CreateApplicationDialog
        visible={creating}
        onClose={() => setCreating(false)}
        onCreate={async (input) => {
          const app = await actions.create(input);
          setCreating(false);
          setCreated({ id: app.id, token: app.bot_token });
        }}
      />
      <SecretReveal
        visible={!!created}
        title="Copy the bot token now"
        secret={created?.token ?? null}
        description="Your bot signs in with this token. You won't see it again; if you lose it, reset it from the application's page."
        onClose={() => {
          const id = created?.id;
          setCreated(null);
          if (id) router.push({ pathname: '/settings/applications/[id]', params: { id } });
        }}
      />
    </SettingsPage>
  );
}

function CreateApplicationDialog({
  visible,
  onClose,
  onCreate,
}: {
  visible: boolean;
  onClose: () => void;
  onCreate: (input: { name: string; bot_username: string; description?: string; icon_url?: string; is_public?: boolean }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = name.trim() && /^[a-zA-Z0-9_.-]{3,32}$/.test(username.trim());
  return (
    <Dialog visible={visible} onClose={onClose}>
      <Text variant="headingMd" accessibilityRole="header">
        New application
      </Text>
      <TextField label="Name" value={name} onChangeText={setName} maxLength={100} autoFocus />
      <TextField label="Bot username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} hint="3-32 letters, numbers, dots, dashes or underscores." />
      <TextField label="Description" value={description} onChangeText={setDescription} multiline maxLength={1000} />
      <TextField label="Icon URL" value={icon} onChangeText={setIcon} autoCapitalize="none" autoCorrect={false} />
      <Checkbox checked={isPublic} onChange={setIsPublic} description="Anyone with Manage place can add the bot to their place.">
        Public application
      </Checkbox>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Stack direction="row" justify="flex-end">
        <Button title="Cancel" variant="tertiary" onPress={onClose} />
        <Button
          title="Create application"
          loading={pending}
          disabled={!valid}
          onPress={async () => {
            setPending(true);
            setError(null);
            try {
              await onCreate({ name: name.trim(), bot_username: username.trim(), description: description.trim() || undefined, icon_url: icon.trim() || undefined, is_public: isPublic });
              setName('');
              setUsername('');
              setDescription('');
              setIcon('');
              setIsPublic(false);
            } catch (e) {
              setError(failureMessage(e, 'The application could not be created.'));
            } finally {
              setPending(false);
            }
          }}
        />
      </Stack>
    </Dialog>
  );
}
