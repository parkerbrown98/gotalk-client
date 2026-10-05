import { channelSiblings, moveChannel } from '@gotalk/core';
import { Button, Checkbox, Dialog, Notice, PillTabs, Stack, Text, TextField, useTheme, type IconName } from '@gotalk/ui';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { ActionList } from '@/components/forum';
import { MenuItem, MenuPopover, MenuSeparator, type Anchor } from '@/components/menu';
import { useChatActions, type Channel } from '@/lib/chat';
import { failureMessage } from '@/lib/failure';
import { useChannelAccess } from '@/lib/places';

/** Counts openings, so a dialog's form starts empty each time yet keeps its content while fading out. */
function useOpenings(visible: boolean): number {
  const [opened, setOpened] = useState({ visible, count: visible ? 1 : 0 });
  if (visible !== opened.visible) setOpened({ visible, count: opened.count + (visible ? 1 : 0) });
  return opened.count;
}

export interface ChannelFormProps {
  slug: string;
  visible: boolean;
  onClose: () => void;
  /** The channel or category to edit; a new one is created without it. */
  channel?: Channel;
  /** The place's categories, to choose where a text channel goes. */
  categories: Channel[];
}

/** New channel or category, or the settings of an existing one (Manage channels). */
export function ChannelFormDialog(props: ChannelFormProps) {
  const openings = useOpenings(props.visible);
  return (
    <Dialog visible={props.visible} onClose={props.onClose}>
      {openings > 0 ? <ChannelForm key={openings} {...props} /> : null}
    </Dialog>
  );
}

function ChannelForm({ slug, onClose, channel, categories }: ChannelFormProps) {
  const theme = useTheme();
  const actions = useChatActions();
  const [kind, setKind] = useState<'text' | 'category'>(channel?.kind === 'category' ? 'category' : 'text');
  const [name, setName] = useState(channel?.name ?? '');
  const [topic, setTopic] = useState(channel?.topic ?? '');
  const [parent, setParent] = useState(channel?.parent_id ?? '');
  const [nsfw, setNsfw] = useState(channel?.is_nsfw ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const text = kind === 'text';
  const noun = text ? 'channel' : 'category';

  async function save() {
    const finalName = name.trim().replace(/\s+/g, ' ');
    if (!finalName) return setError(`Give the ${noun} a name.`);
    if (!actions) return;
    setBusy(true);
    setError(null);
    try {
      if (channel) {
        await actions.updateChannel(channel.id, text ? { name: finalName, topic: topic.trim(), parent_id: parent, is_nsfw: nsfw } : { name: finalName });
        onClose();
      } else {
        const created = await actions.createChannel(slug, text ? { kind, name: finalName, topic: topic.trim(), parent_id: parent || undefined, is_nsfw: nsfw } : { kind, name: finalName });
        onClose();
        if (created.kind === 'text') router.push({ pathname: '/places/[slug]/channels/[id]', params: { slug, id: created.id } });
      }
    } catch (e) {
      setError(failureMessage(e, `Could not save the ${noun}. Try again.`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Text variant="headingMd" accessibilityRole="header">
        {channel ? `Edit ${noun}` : 'New channel'}
      </Text>
      <Stack gap="md">
        {channel ? null : (
          <Stack gap="xs">
            <Text variant="bodySmStrong" tone="onDark">
              Type
            </Text>
            <PillTabs
              options={[
                { value: 'text', label: 'Text channel' },
                { value: 'category', label: 'Category' },
              ]}
              value={kind}
              onChange={setKind}
            />
          </Stack>
        )}
        <TextField label="Name" value={name} onChangeText={setName} maxLength={100} autoFocus autoCapitalize="none" />
        {text ? (
          <>
            <TextField label="Topic" value={topic} onChangeText={setTopic} placeholder="What to talk about here (optional)" maxLength={1024} />
            {categories.length > 0 ? (
              <Stack gap="xs">
                <Text variant="bodySmStrong" tone="onDark">
                  Category
                </Text>
                <PillTabs options={[{ value: '', label: 'None' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]} value={parent} onChange={setParent} />
              </Stack>
            ) : null}
            <Checkbox checked={nsfw} onChange={setNsfw}>
              Age-restricted (NSFW)
            </Checkbox>
          </>
        ) : null}
      </Stack>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: theme.space.sm }}>
        <Button title="Cancel" variant="tertiary" onPress={onClose} />
        <Button title={channel ? 'Save' : text ? 'Create channel' : 'Create category'} loading={busy} onPress={() => void save()} />
      </View>
    </>
  );
}

function DeleteChannelDialog({ channel, visible, onClose, onDeleted }: { channel: Channel; visible: boolean; onClose: () => void; onDeleted?: () => void }) {
  const theme = useTheme();
  const actions = useChatActions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const category = channel.kind === 'category';
  const count = channel.message_count;
  return (
    <Dialog visible={visible} onClose={onClose}>
      <Text variant="headingMd" accessibilityRole="header">
        {category ? `Delete the ${channel.name} category?` : `Delete #${channel.name}?`}
      </Text>
      <Text variant="bodySm" tone="muted">
        {category
          ? 'Its channels move to the top level. Nothing else is deleted.'
          : `${count > 0 ? `Its ${count.toLocaleString('en-US')} ${count === 1 ? 'message' : 'messages'} and their threads are` : 'It is'} deleted for everyone. This cannot be undone.`}
      </Text>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: theme.space.sm }}>
        <Button title="Keep" variant="tertiary" onPress={onClose} />
        <Button
          title={category ? 'Delete category' : 'Delete channel'}
          variant="danger"
          loading={busy}
          onPress={async () => {
            if (!actions) return;
            setBusy(true);
            setError(null);
            try {
              await actions.deleteChannel(channel.id);
              onClose();
              onDeleted?.();
            } catch (e) {
              setError(failureMessage(e, `Could not delete the ${category ? 'category' : 'channel'}. Try again.`));
            } finally {
              setBusy(false);
            }
          }}
        />
      </View>
    </Dialog>
  );
}

export interface ChannelMenuItem {
  key: string;
  label: string;
  icon: IconName;
  danger?: boolean;
  onPress: () => void;
}

/**
 * What the viewer may do with a channel or category: mute it (anyone, text channels), and edit,
 * reorder or delete it (Manage channels), with the dialogs those open.
 */
export function useChannelMenu(channel: Channel | undefined, all: Channel[], slug: string, onDeleted?: () => void): { items: ChannelMenuItem[]; dialogs: ReactNode; problem: string | null } {
  const actions = useChatActions();
  const access = useChannelAccess(channel);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  if (!channel || !actions) return { items: [], dialogs: null, problem };

  const run = (work: () => Promise<unknown>, fallback: string) => {
    setProblem(null);
    work().catch((e) => setProblem(failureMessage(e, fallback)));
  };
  const category = channel.kind === 'category';
  const noun = category ? 'category' : 'channel';
  const manage = access.can('MANAGE_CHANNELS');
  const siblings = channelSiblings(all, channel);
  const up = moveChannel(siblings, channel.id, -1);
  const down = moveChannel(siblings, channel.id, 1);
  const muted = channel.subscription === 'muted';

  const items: ChannelMenuItem[] = [];
  if (channel.kind === 'text') {
    items.push({ key: 'mute', label: muted ? 'Unmute channel' : 'Mute channel', icon: muted ? 'bell' : 'bellOff', onPress: () => run(() => actions.setMuted(channel.id, !muted), 'Could not change notifications. Try again.') });
  }
  if (manage) {
    items.push({ key: 'edit', label: `Edit ${noun}`, icon: 'settings', onPress: () => setEditing(true) });
    if (up.length) items.push({ key: 'up', label: 'Move up', icon: 'arrowUp', onPress: () => run(() => actions.reorderChannels(up), 'Could not move it. Try again.') });
    if (down.length) items.push({ key: 'down', label: 'Move down', icon: 'arrowDown', onPress: () => run(() => actions.reorderChannels(down), 'Could not move it. Try again.') });
    items.push({ key: 'delete', label: `Delete ${noun}`, icon: 'trash', danger: true, onPress: () => setDeleting(true) });
  }

  const dialogs = (
    <>
      <ChannelFormDialog slug={slug} visible={editing} onClose={() => setEditing(false)} channel={channel} categories={all.filter((c) => c.kind === 'category')} />
      <DeleteChannelDialog channel={channel} visible={deleting} onClose={() => setDeleting(false)} onDeleted={onDeleted} />
    </>
  );
  return { items, dialogs, problem };
}

/** The channel menu: a popover on wide screens (given an anchor), a sheet on phones. */
export function ChannelMenu({ items, visible, onClose, anchor }: { items: ChannelMenuItem[]; visible: boolean; onClose: () => void; anchor?: Anchor }) {
  if (!anchor) return <ActionList items={items} visible={visible} onClose={onClose} />;
  return (
    <MenuPopover visible={visible} onClose={onClose} anchor={anchor}>
      {items.map((item, i) => (
        <View key={item.key}>
          {i > 0 && (item.key === 'edit' || item.key === 'delete') ? <MenuSeparator /> : null}
          <MenuItem
            label={item.label}
            icon={item.icon}
            danger={item.danger}
            onPress={() => {
              onClose();
              item.onPress();
            }}
          />
        </View>
      ))}
    </MenuPopover>
  );
}

/** Anyone in a group conversation can rename it. */
export function RenameConversationDialog({ channel, visible, onClose }: { channel: Channel; visible: boolean; onClose: () => void }) {
  const openings = useOpenings(visible);
  return (
    <Dialog visible={visible} onClose={onClose}>
      {openings > 0 ? <RenameForm key={openings} channel={channel} onClose={onClose} /> : null}
    </Dialog>
  );
}

function RenameForm({ channel, onClose }: { channel: Channel; onClose: () => void }) {
  const theme = useTheme();
  const actions = useChatActions();
  const [name, setName] = useState(channel.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Text variant="headingMd" accessibilityRole="header">
        Rename conversation
      </Text>
      <TextField label="Name" value={name} onChangeText={setName} maxLength={100} autoFocus hint="Everyone in the conversation sees the new name." />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: theme.space.sm }}>
        <Button title="Cancel" variant="tertiary" onPress={onClose} />
        <Button
          title="Save"
          loading={busy}
          onPress={async () => {
            const finalName = name.trim().replace(/\s+/g, ' ');
            if (!finalName) return setError('Give the conversation a name.');
            if (!actions) return;
            setBusy(true);
            setError(null);
            try {
              await actions.renameConversation(channel.id, finalName);
              onClose();
            } catch (e) {
              setError(failureMessage(e, 'Could not rename the conversation. Try again.'));
            } finally {
              setBusy(false);
            }
          }}
        />
      </View>
    </>
  );
}
