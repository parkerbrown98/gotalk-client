import { Avatar, Button, ListCard, ListRow, Notice, Stack, Text, TextField } from '@gotalk/ui';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { PlaceSettingsPage, usePlaceSettings } from '@/components/place-settings';
import { useApplicationActions, useApplications } from '@/lib/developer';
import { failureMessage } from '@/lib/failure';

export default function PlaceBots() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { place, access } = usePlaceSettings(slug);
  const applications = useApplications();
  const actions = useApplicationActions();
  const [applicationID, setApplicationID] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  if (!place) return null;
  if (!access.can('MANAGE_PLACE')) return <Redirect href={{ pathname: '/places/[slug]/settings', params: { slug: place.slug } }} />;

  async function add(id: string) {
    setPending(id);
    setError(null);
    setAdded(null);
    try {
      await actions.addToPlace(place!.slug, id.trim());
      setAdded(id.trim());
      if (id === applicationID) setApplicationID('');
    } catch (e) {
      setError(failureMessage(e, 'The bot could not be added.'));
    } finally {
      setPending(null);
    }
  }

  return (
    <PlaceSettingsPage slug={place.slug} title="Bots" description={`Add an application's bot to ${place.name}. It joins as a member and gets the @everyone role; give it more with roles.`}>
      <Stack gap="lg">
        <Stack gap="sm">
          <TextField label="Application ID" value={applicationID} onChangeText={setApplicationID} autoCapitalize="none" autoCorrect={false} placeholder="Ask the bot's developer for it" />
          <Button title="Add bot" onPress={() => add(applicationID)} disabled={!applicationID.trim()} loading={pending === applicationID.trim()} style={{ alignSelf: 'flex-start' }} />
        </Stack>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {added ? <Notice tone="success">Bot added to {place.name}.</Notice> : null}
        {applications.isPending ? <ActivityIndicator /> : null}
        {applications.isError ? <Notice tone="danger">Your applications could not be loaded.</Notice> : null}
        {applications.data?.length ? (
          <Text variant="captionMd" tone="muted">
            Your applications
          </Text>
        ) : null}
        {applications.data?.length ? (
          <ListCard>
            {applications.data.map((app) => (
              <ListRow
                key={app.id}
                leading={<Avatar name={app.name} uri={app.icon_url} size={32} />}
                title={app.name}
                subtitle={`${app.is_public ? 'Public' : 'Private'} application · @${app.bot.username}`}
                trailing={<Button title={pending === app.id ? 'Adding' : 'Add'} variant="outline" size="sm" loading={pending === app.id} onPress={() => add(app.id)} />}
              />
            ))}
          </ListCard>
        ) : (
          <Text variant="bodySm" tone="muted">
            You do not own any applications yet. Create one from account settings, or paste a public application ID above.
          </Text>
        )}
        <Text variant="captionMd" tone="muted">
          Private applications can only be added by their owner. Bots show in Members with a Bot badge, where you can give them roles or remove them.
        </Text>
      </Stack>
    </PlaceSettingsPage>
  );
}
