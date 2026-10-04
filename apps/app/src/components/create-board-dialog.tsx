import { Button, Checkbox, Dialog, Notice, PillTabs, Stack, Text, TextField } from '@gotalk/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { messageFor } from '@/components/forum';
import { useForumActions } from '@/lib/forums';

/** "Show your work" becomes "show-your-work"; slugs are 3-32 letters, digits and dashes. */
export function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/, '');
}

/** New forum, for people with Manage boards. */
export function CreateBoardDialog({ slug, visible, onClose }: { slug: string; visible: boolean; onClose: () => void }) {
  const actions = useForumActions();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [edited, setEdited] = useState(false);
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<'flat' | 'threaded'>('flat');
  const [solutions, setSolutions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    const finalName = name.trim();
    if (!finalName) return setError('Give the forum a name.');
    if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(address)) return setError('The address is 3-32 lowercase letters, numbers or dashes, starting and ending with a letter or number.');
    setBusy(true);
    setError(null);
    try {
      const board = await actions.createBoard(slug, { kind: 'board', name: finalName, slug: address, description: description.trim(), reply_mode: mode, solutions_enabled: solutions });
      setName('');
      setAddress('');
      setEdited(false);
      setDescription('');
      setSolutions(false);
      setMode('flat');
      onClose();
      router.push({ pathname: '/places/[slug]/boards/[id]', params: { slug, id: board.id } });
    } catch (e) {
      setError(messageFor(e, 'Could not create the forum. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog visible={visible} onClose={onClose}>
      <Text variant="headingMd" accessibilityRole="header">
        New forum
      </Text>
      <Stack gap="md">
        <TextField
          label="Name"
          value={name}
          maxLength={100}
          onChangeText={(v) => {
            setName(v);
            if (!edited) setAddress(slugFromName(v));
          }}
        />
        <TextField
          label="Address"
          value={address}
          hint="Used in links to this forum."
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={(v) => {
            setEdited(true);
            setAddress(v.toLowerCase());
          }}
        />
        <TextField label="Description" value={description} onChangeText={setDescription} placeholder="What belongs here" maxLength={500} />
        <Stack gap="xs">
          <Text variant="bodySmStrong" tone="onDark">
            Replies
          </Text>
          <PillTabs
            options={[
              { value: 'flat', label: 'Flat' },
              { value: 'threaded', label: 'Threaded' },
            ]}
            value={mode}
            onChange={setMode}
          />
        </Stack>
        <Checkbox checked={solutions} onChange={setSolutions}>
          Let the topic author mark an accepted answer
        </Checkbox>
      </Stack>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
        <Button title="Cancel" variant="tertiary" onPress={onClose} />
        <Button title="Create forum" loading={busy} onPress={create} />
      </View>
    </Dialog>
  );
}
