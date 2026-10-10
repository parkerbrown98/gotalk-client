import { Button, Checkbox, Dialog, Notice, Stack, Text, TextField, useTheme } from '@gotalk/ui';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ImagePicker } from '@/components/image-picker';
import { PlaceForm } from '@/components/place-form';
import { PlaceSettingsPage, sectionHref, usePlaceSettings } from '@/components/place-settings';
import { classifyFailure, failureMessage } from '@/lib/failure';
import { useFeedActions, useFeedCapabilities } from '@/lib/feeds';
import { useActiveInstance } from '@/lib/instances';
import { resetTo } from '@/lib/layout';
import { usePlaceActions } from '@/lib/places';
import { useImageActions, useInstanceCapabilities } from '@/lib/uploads';

export default function PlaceGeneralSettings() {
  const theme = useTheme();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { place, access } = usePlaceSettings(slug);
  const actions = usePlaceActions();
  const active = useActiveInstance();
  const uploads = useInstanceCapabilities();
  const images = useImageActions();
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const feedActions = useFeedActions();
  const caps = useFeedCapabilities();
  const [voting, setVoting] = useState<boolean | null>(null);
  const [votingError, setVotingError] = useState<string | null>(null);

  if (!place) return null;
  if (!access.can('MANAGE_PLACE')) return <Redirect href={{ pathname: '/places/[slug]/settings', params: { slug: place.slug } }} />;

  async function remove() {
    if (!place) return;
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
    <PlaceSettingsPage slug={place.slug} title="General" width={480}>
      <Stack gap="xl">
        <PlaceForm
          key={place.id}
          initial={{ name: place.name, slug: place.slug, description: place.description, visibility: place.visibility }}
          submitLabel="Save changes"
          secondaryLabel="Discard"
          slugHint="Changing it breaks links people already have."
          onSubmit={async (values) => {
            const updated = await actions.update(place.slug, values);
            if (updated.slug !== place.slug) resetTo(sectionHref(updated.slug, 'general'));
          }}
          onSecondary={() => resetTo(sectionHref(place.slug, 'general'))}
        />
        {active ? (
          <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.hairline, paddingTop: theme.space.lg, gap: theme.space.lg }}>
            <Stack gap="sm">
              <Text variant="bodySmStrong" tone="onDark">
                Icon
              </Text>
              <ImagePicker
                purpose="placeIcon"
                noun="icon"
                name={place.name}
                url={place.icon_url}
                origin={active.origin}
                caps={uploads}
                onUpload={(image, type) => images.setPlaceImage(place.slug, 'icon', image, type)}
                onRemove={() => images.removePlaceImage(place.slug, 'icon')}
                onSetUrl={async (url) => void (await actions.update(place.slug, { icon_url: url }))}
              />
            </Stack>
            <Stack gap="sm">
              <Text variant="bodySmStrong" tone="onDark">
                Banner
              </Text>
              <ImagePicker
                purpose="placeBanner"
                noun="banner"
                name={place.name}
                url={place.banner_url}
                origin={active.origin}
                caps={uploads}
                onUpload={(image, type) => images.setPlaceImage(place.slug, 'banner', image, type)}
                onRemove={() => images.removePlaceImage(place.slug, 'banner')}
                onSetUrl={async (url) => void (await actions.update(place.slug, { banner_url: url }))}
              />
            </Stack>
          </View>
        ) : null}
        {caps.votes ? (
          <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.hairline, paddingTop: theme.space.lg, gap: theme.space.md }}>
            <Checkbox
              checked={voting ?? place.voting_enabled}
              disabled={voting !== null}
              onChange={(next) => {
                setVoting(next);
                setVotingError(null);
                feedActions
                  .setVoting(place.slug, next)
                  .catch((e) => setVotingError(failureMessage(e, 'Could not change voting. Try again.')))
                  .finally(() => setVoting(null));
              }}
              description="Members can vote topics up and down, and feeds can sort by controversy. When off, feeds rank topics by reactions on their opening post. Saved right away."
            >
              Topic voting
            </Checkbox>
            {votingError ? <Notice tone="danger">{votingError}</Notice> : null}
          </View>
        ) : null}
        {access.isOwner ? (
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
      </Stack>
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
    </PlaceSettingsPage>
  );
}
