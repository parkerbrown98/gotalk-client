import { boardIndexBlock, boardIndexState, INDEX_REMOVAL_TIME, placeIndexBlock, placeIndexState, shouldShowIndexNotice } from '@gotalk/core';
import { Badge, Button, Checkbox, Dialog, Icon, Notice, Stack, Text, TextField, useTheme } from '@gotalk/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { InlineLink } from '@/components/inline-link';
import { useInstanceInfo, useMe } from '@/lib/api';
import { failureMessage } from '@/lib/failure';
import { dismissIndexNotice, useDismissedIndexNotices } from '@/lib/index-notices';
import { useActiveInstance } from '@/lib/instances';
import type { Board, Place } from '@/lib/places';
import { useIndexActions } from '@/lib/search-index';

const PUBLIC_LABEL = 'Public: visible to search engines';

/** The persistent mark on a place that is in the public index right now. */
export function IndexedIndicator({ compact }: { compact?: boolean }) {
  const theme = useTheme();
  return (
    <View accessible accessibilityLabel={PUBLIC_LABEL} style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? 4 : 6 }}>
      <Icon name="globe" size={compact ? 12 : 14} color={theme.colors.mute} />
      <Text variant={compact ? 'captionSm' : 'captionMd'} tone="muted" style={{ flexShrink: 1 }}>
        {PUBLIC_LABEL}
      </Text>
    </View>
  );
}

/**
 * Shown once to a member of an indexed place, until dismissed on this device: what is public and how to
 * keep their own posts out.
 */
export function IndexedPlaceNotice({ place, isMember }: { place: Place; isMember: boolean }) {
  const theme = useTheme();
  const inst = useActiveInstance()?.id;
  const dismissed = useDismissedIndexNotices(inst);
  if (!inst || dismissed === undefined || !shouldShowIndexNotice(place, isMember, dismissed)) return null;
  return (
    <Stack gap="sm">
      <Notice tone="info" icon="globe" title="This place is public.">
        {place.index_notice || 'Its public forums appear in search engines and the public Gotalk directory.'} Write here as you would in public.{' '}
        <InlineLink onPress={() => router.push('/settings/privacy')}>Search privacy settings</InlineLink>
      </Notice>
      <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
        <Button title="Got it" variant="tertiary" size="sm" accessibilityLabel="Dismiss the notice about search engines" onPress={() => dismissIndexNotice(inst, place.id)} />
      </View>
    </Stack>
  );
}

/** Place settings: let the place's public forums appear in search engines (MANAGE_PLACE). Saved right away. */
export function PlaceSearchSetting({ place }: { place: Place }) {
  const theme = useTheme();
  const actions = useIndexActions();
  const admin = useMe().data?.is_instance_admin ?? false;
  const listed = useInstanceInfo().data?.directory?.listed;
  const [pending, setPending] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const block = placeIndexBlock(place);
  const state = placeIndexState(place, listed);
  const label = 'Allow this place to appear in search engines';

  function change(next: boolean) {
    setPending(next);
    setError(null);
    actions
      .setPlaceIndexable(place.slug, next)
      .catch((e) => setError(failureMessage(e, 'Could not change this. Try again.')))
      .finally(() => setPending(null));
  }

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.hairline, paddingTop: theme.space.lg, gap: theme.space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
        <Text variant="bodySmStrong" tone="onDark" style={{ flex: 1 }}>
          Search engines
        </Text>
        <Badge label={state.label} tone={state.tone} />
      </View>
      <Checkbox
        checked={pending ?? (place.indexable && !block)}
        disabled={!!block || pending !== null}
        onChange={change}
        accessibilityLabel={label}
        accessibilityHint={block ?? undefined}
        description={`Forums that signed-out visitors can read are shown in search engines and the public Gotalk directory, with links back here. Chat, other forums and member lists never are. Turning this off removes the place ${INDEX_REMOVAL_TIME}. Saved right away.`}
      >
        {label}
      </Checkbox>
      {block ? (
        <Notice tone="info" icon="lock">
          {block}
        </Notice>
      ) : null}
      {!block && state.detail ? (
        <Notice tone="warning">
          {state.detail}
          {admin ? (
            <>
              {' '}
              <InlineLink onPress={() => router.push({ pathname: '/settings/server', params: { section: 'directory' } })}>Open the directory settings</InlineLink>
            </>
          ) : null}
        </Notice>
      ) : null}
      {place.index_notice ? (
        <Text variant="captionMd" tone="muted">
          {place.index_notice}
        </Text>
      ) : null}
      {block ? null : (
        <Text variant="captionMd" tone="muted">
          {place.index_notice ? '' : 'Members can keep their own posts out in their account settings. '}
          To leave out a single forum, use Exclude from search engines in its settings.
        </Text>
      )}
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </View>
  );
}

/** A forum's name, description and search setting, for people with Manage boards. */
export function BoardSettingsDialog({ slug, board, place, visible, onClose }: { slug: string; board: Board; place: Place | undefined; visible: boolean; onClose: () => void }) {
  // Counts openings, so the form starts fresh each time yet keeps its content while the dialog fades out.
  const [opened, setOpened] = useState({ visible, count: visible ? 1 : 0 });
  if (visible !== opened.visible) setOpened({ visible, count: opened.count + (visible ? 1 : 0) });
  return (
    <Dialog visible={visible} onClose={onClose}>
      {opened.count > 0 ? <BoardSettingsForm key={`${board.id}:${opened.count}`} slug={slug} board={board} place={place} onClose={onClose} /> : null}
    </Dialog>
  );
}

function BoardSettingsForm({ slug, board, place, onClose }: { slug: string; board: Board; place: Place | undefined; onClose: () => void }) {
  const theme = useTheme();
  const actions = useIndexActions();
  const [name, setName] = useState(board.name);
  const [description, setDescription] = useState(board.description);
  const [exclude, setExclude] = useState(!board.indexable);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const block = boardIndexBlock(board);
  const state = boardIndexState(board, place?.indexed ?? false);
  const noun = board.kind === 'category' ? 'category' : 'forum';
  const label = 'Exclude from search engines';

  const changes = {
    ...(name.trim() !== board.name ? { name: name.trim() } : {}),
    ...(description.trim() !== board.description ? { description: description.trim() } : {}),
    ...(!block && exclude === board.indexable ? { indexable: !exclude } : {}),
  };
  const dirty = Object.keys(changes).length > 0;

  async function save() {
    if (!name.trim()) return setError(`Give the ${noun} a name.`);
    setBusy(true);
    setError(null);
    try {
      await actions.updateBoard(slug, board.id, changes);
      onClose();
    } catch (e) {
      setError(failureMessage(e, `Could not save the ${noun}. Try again.`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Text variant="headingMd" accessibilityRole="header">
        {board.kind === 'category' ? 'Category settings' : 'Forum settings'}
      </Text>
      <Stack gap="md">
        <TextField label="Name" value={name} onChangeText={setName} maxLength={100} />
        <TextField label="Description" value={description} onChangeText={setDescription} placeholder="What belongs here" maxLength={500} />
        <View style={{ gap: theme.space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
            <Text variant="bodySmStrong" tone="onDark" style={{ flex: 1 }}>
              Search engines
            </Text>
            <Badge label={state.label} tone={state.tone} />
          </View>
          <Checkbox
            checked={block ? true : exclude}
            disabled={!!block}
            onChange={setExclude}
            accessibilityLabel={label}
            accessibilityHint={block ?? undefined}
            description={`Keeps this ${noun}${board.kind === 'category' ? ' and the forums in it' : ' and any forums under it'} out of search engines and the public Gotalk directory, even when the place appears there. Removal takes effect ${INDEX_REMOVAL_TIME}.`}
          >
            {label}
          </Checkbox>
          {block ? (
            <Text variant="captionMd" tone="muted">
              {block}
            </Text>
          ) : state.detail ? (
            <Text variant="captionMd" tone="muted">
              {state.detail}
            </Text>
          ) : null}
          {board.index_notice ? (
            <Text variant="captionMd" tone="muted">
              {board.index_notice}
            </Text>
          ) : null}
        </View>
      </Stack>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: theme.space.sm }}>
        <Button title="Cancel" variant="tertiary" onPress={onClose} />
        <Button title="Save" loading={busy} disabled={!dirty} onPress={save} />
      </View>
    </>
  );
}
