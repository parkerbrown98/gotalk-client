import { unwrap } from '@gotalk/api-client';
import { hasPermission, normalizeCommandDrafts, validateCommandDrafts, type CommandDraft, type CommandOptionType } from '@gotalk/core';
import { Avatar, Badge, Button, Checkbox, Dialog, Icon, ListCard, ListRow, Notice, PillTabs, Stack, Text, TextField, useTheme } from '@gotalk/ui';
import { useQueries } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';

import { SecretReveal } from '@/components/secret-reveal';
import { SettingsPage } from '@/components/settings-page';
import { useApiClient, useInstanceInfo, useMe } from '@/lib/api';
import { useApplication, useApplicationActions, useApplicationCommands, type Application, type Command } from '@/lib/developer';
import { failureMessage } from '@/lib/failure';
import { useActiveInstance } from '@/lib/instances';
import { useWide } from '@/lib/layout';
import { useMyPlaces, usePermissionTable } from '@/lib/places';

const TYPE_OPTIONS: { value: CommandOptionType; label: string }[] = [
  { value: 'string', label: 'Text' },
  { value: 'integer', label: 'Integer' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'True/false' },
  { value: 'user', label: 'User' },
  { value: 'channel', label: 'Channel' },
];

function toDrafts(commands: readonly Command[]): CommandDraft[] {
  return normalizeCommandDrafts(
    commands.map((c) => ({ name: c.name, description: c.description, options: (c.options ?? []).map((o) => ({ name: o.name, description: o.description, type: o.type, required: !!o.required })) })),
  );
}

/** Counts openings, so a dialog's form starts fresh each time yet keeps its content while fading out. */
function useOpenings(visible: boolean): number {
  const [opened, setOpened] = useState({ visible, count: visible ? 1 : 0 });
  if (visible !== opened.visible) setOpened({ visible, count: opened.count + (visible ? 1 : 0) });
  return opened.count;
}

function Section({ title, description, end, children }: { title: string; description?: string; end?: ReactNode; children: ReactNode }) {
  const theme = useTheme();
  return (
    <Stack gap="md">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}>
        <Stack gap="none" style={{ flex: 1 }}>
          <Text variant="headingSm" accessibilityRole="header">
            {title}
          </Text>
          {description ? (
            <Text variant="captionMd" tone="muted">
              {description}
            </Text>
          ) : null}
        </Stack>
        {end}
      </View>
      {children}
    </Stack>
  );
}

export default function ApplicationDetail() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const app = useApplication(id);
  const commands = useApplicationCommands(id);
  const me = useMe().data;
  const application = app.data;

  if (app.isPending) {
    return (
      <SettingsPage title="Application">
        <ActivityIndicator />
      </SettingsPage>
    );
  }
  if (!application) {
    return (
      <SettingsPage title="Application">
        <Notice tone="danger" title="This application could not be loaded.">
          It may have been deleted, or it belongs to someone else.
        </Notice>
        <Button title="Back to applications" variant="tertiary" onPress={() => router.replace('/settings/applications')} style={{ alignSelf: 'flex-start' }} />
      </SettingsPage>
    );
  }
  const mine = application.owner_id === me?.id;

  return (
    <SettingsPage title={application.name} subtitle={`@${application.bot.username} · ${application.is_public ? 'Public' : 'Private'}`} width={720}>
      <Stack gap="xxl">
        <Pressable accessibilityRole="link" onPress={() => router.replace('/settings/applications')} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}>
          <Icon name="chevronLeft" size={14} color={theme.colors.mute} />
          <Text variant="captionMd" tone="muted">
            Applications
          </Text>
        </Pressable>
        {mine ? <GeneralForm key={`${application.id}-${application.name}-${application.description}-${application.icon_url}-${application.is_public}`} application={application} /> : null}
        <BotSection application={application} canManage={mine} />
        {commands.isPending ? <ActivityIndicator /> : null}
        {commands.isError ? <Notice tone="danger">The slash commands could not be loaded.</Notice> : null}
        {commands.data ? <CommandsEditor key={commands.dataUpdatedAt} application={application} saved={commands.data} canManage={mine} /> : null}
        {mine ? <DangerZone application={application} /> : null}
      </Stack>
    </SettingsPage>
  );
}

function GeneralForm({ application }: { application: Application }) {
  const theme = useTheme();
  const actions = useApplicationActions(application.id);
  const [name, setName] = useState(application.name);
  const [description, setDescription] = useState(application.description);
  const [icon, setIcon] = useState(application.icon_url ?? '');
  const [isPublic, setIsPublic] = useState(application.is_public);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = name.trim() !== application.name || description !== application.description || icon.trim() !== (application.icon_url ?? '') || isPublic !== application.is_public;

  return (
    <Section title="General" description="What people see when the bot joins their place.">
      <View style={{ flexDirection: 'row', gap: theme.space.lg, alignItems: 'center' }}>
        <Avatar name={name || application.name} uri={icon.trim() || null} size={48} />
        <View style={{ flex: 1 }}>
          <TextField label="Name" value={name} onChangeText={setName} maxLength={100} />
        </View>
      </View>
      <TextField label="Description" value={description} onChangeText={setDescription} multiline maxLength={1000} />
      <TextField label="Icon URL" value={icon} onChangeText={setIcon} autoCapitalize="none" autoCorrect={false} keyboardType="url" hint="An https image URL. Leave it empty for the initials icon." />
      <Checkbox checked={isPublic} onChange={setIsPublic} description="Anyone with Manage place can add the bot to their place using its application ID.">
        Public
      </Checkbox>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
        <Button
          title="Save changes"
          variant="outline"
          loading={saving}
          disabled={!dirty || !name.trim()}
          onPress={async () => {
            setSaving(true);
            setError(null);
            try {
              await actions.update({ name: name.trim(), description: description.trim(), icon_url: icon.trim(), is_public: isPublic });
            } catch (e) {
              setError(failureMessage(e, 'The application could not be saved. Try again.'));
            } finally {
              setSaving(false);
            }
          }}
        />
        <Button
          title="Discard"
          variant="tertiary"
          disabled={!dirty || saving}
          onPress={() => {
            setName(application.name);
            setDescription(application.description);
            setIcon(application.icon_url ?? '');
            setIsPublic(application.is_public);
            setError(null);
          }}
        />
      </View>
    </Section>
  );
}

function BotSection({ application, canManage }: { application: Application; canManage: boolean }) {
  const theme = useTheme();
  const actions = useApplicationActions(application.id);
  const [copied, setCopied] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  return (
    <Section title="Bot" description="The account that joins places and answers commands. Share the application ID so others can add a public bot.">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md, padding: theme.space.md, borderRadius: theme.radii.md, borderWidth: 1, borderColor: theme.colors.hairline, backgroundColor: theme.colors.surface }}>
        <Avatar name={application.bot.display_name} uri={application.bot.avatar_url} size={36} />
        <Stack gap="none" style={{ flex: 1 }}>
          <Text variant="bodySmStrong" tone="onDark">
            @{application.bot.username}
          </Text>
          <Text variant="captionMd" tone="muted" selectable style={{ fontFamily: Platform.OS === 'web' ? theme.fontFamilies.mono : 'monospace' }}>
            {application.id}
          </Text>
        </Stack>
        <Button
          title={copied ? 'Copied' : 'Copy ID'}
          variant="tertiary"
          size="sm"
          onPress={async () => {
            await Clipboard.setStringAsync(application.id);
            setCopied(true);
          }}
        />
      </View>
      {canManage ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
          <Button title="Add to a place" variant="tertiary" onPress={() => setAdding(true)} />
          <Button title="Reset token" variant="outline" onPress={() => setConfirmReset(true)} />
        </View>
      ) : null}
      <AddToPlaceDialog visible={adding} application={application} onClose={() => setAdding(false)} />
      <Dialog visible={confirmReset} onClose={() => setConfirmReset(false)}>
        <Text variant="headingMd" accessibilityRole="header">
          Reset the bot token?
        </Text>
        <Text variant="bodySm" tone="muted">
          The current token stops working at once and the bot disconnects until it signs in with the new one.
        </Text>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: theme.space.sm }}>
          <Button title="Cancel" variant="tertiary" onPress={() => setConfirmReset(false)} />
          <Button
            title="Reset token"
            variant="danger"
            loading={resetting}
            onPress={async () => {
              setResetting(true);
              setError(null);
              try {
                const next = await actions.resetToken();
                setConfirmReset(false);
                setSecret(next.bot_token);
              } catch (e) {
                setError(failureMessage(e, 'The token could not be reset. Try again.'));
              } finally {
                setResetting(false);
              }
            }}
          />
        </View>
      </Dialog>
      <SecretReveal visible={!!secret} title="Copy the new bot token" secret={secret} description="You won't see it again. If you lose it, reset it again." onClose={() => setSecret(null)} />
    </Section>
  );
}

function CommandsEditor({ application, saved, canManage }: { application: Application; saved: Command[]; canManage: boolean }) {
  const theme = useTheme();
  const actions = useApplicationActions(application.id);
  const limit = useInstanceInfo().data?.limits.commands_per_application ?? 50;
  const initial = useMemo(() => toDrafts(saved), [saved]);
  const [drafts, setDrafts] = useState<CommandDraft[]>(initial);
  const [editing, setEditing] = useState<{ index: number; command: CommandDraft } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(normalizeCommandDrafts(drafts)) !== JSON.stringify(initial);

  async function save() {
    const problem = validateCommandDrafts(drafts);
    if (problem) return setError(problem);
    setSaving(true);
    setError(null);
    try {
      await actions.saveCommands(normalizeCommandDrafts(drafts));
    } catch (e) {
      setError(failureMessage(e, 'The commands could not be saved. Try again.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section
      title="Slash commands"
      description={canManage ? 'Edit them here, then save them together. People see them as suggestions when they type / in a channel the bot can see.' : 'What people can ask this bot to do.'}
      end={dirty ? <Badge label="Not saved" tone="warning" /> : undefined}
    >
      {drafts.length === 0 ? (
        <Text variant="bodySm" tone="muted">
          No commands yet.
        </Text>
      ) : (
        <ListCard>
          {drafts.map((command, index) => (
            <ListRow
              key={`${command.name}-${index}`}
              icon="command"
              title={`/${command.name}`}
              subtitle={`${command.description} · ${command.options.length} ${command.options.length === 1 ? 'option' : 'options'}`}
              chevron={canManage}
              onPress={canManage ? () => setEditing({ index, command }) : undefined}
            />
          ))}
        </ListCard>
      )}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {canManage ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
          <Button title="Add command" variant="tertiary" disabled={drafts.length >= limit} onPress={() => setEditing({ index: -1, command: { name: '', description: '', options: [] } })} />
          <View style={{ flex: 1 }} />
          {dirty ? <Button title="Discard" variant="tertiary" disabled={saving} onPress={() => setDrafts(initial)} /> : null}
          <Button title="Save commands" loading={saving} disabled={!dirty} onPress={save} />
        </View>
      ) : null}
      <CommandDialog
        editing={editing}
        taken={drafts.filter((_, i) => i !== editing?.index).map((c) => c.name)}
        onClose={() => setEditing(null)}
        onSave={(command) => {
          if (!editing) return;
          setDrafts((current) => (editing.index < 0 ? [...current, command] : current.map((c, i) => (i === editing.index ? command : c))));
          setEditing(null);
        }}
        onRemove={
          editing && editing.index >= 0
            ? () => {
                const index = editing.index;
                setDrafts((current) => current.filter((_, i) => i !== index));
                setEditing(null);
              }
            : undefined
        }
      />
    </Section>
  );
}

function CommandDialog({ editing, taken, onClose, onSave, onRemove }: { editing: { index: number; command: CommandDraft } | null; taken: string[]; onClose: () => void; onSave: (command: CommandDraft) => void; onRemove?: () => void }) {
  const openings = useOpenings(!!editing);
  const { height } = useWindowDimensions();
  const [shown, setShown] = useState(editing);
  if (editing && editing !== shown) setShown(editing);
  return (
    <Dialog visible={!!editing} onClose={onClose}>
      <ScrollView style={{ maxHeight: height * 0.8 }} contentContainerStyle={{ gap: 16 }} keyboardShouldPersistTaps="handled">
        {openings > 0 && shown ? <CommandForm key={openings} initial={shown.command} isNew={shown.index < 0} taken={taken} onClose={onClose} onSave={onSave} onRemove={onRemove} /> : null}
      </ScrollView>
    </Dialog>
  );
}

function CommandForm({ initial, isNew, taken, onClose, onSave, onRemove }: { initial: CommandDraft; isNew: boolean; taken: string[]; onClose: () => void; onSave: (command: CommandDraft) => void; onRemove?: () => void }) {
  const theme = useTheme();
  const wide = useWide();
  const [command, setCommand] = useState<CommandDraft>(initial);
  const [error, setError] = useState<string | null>(null);
  const setOption = (index: number, change: Partial<CommandDraft['options'][number]>) => setCommand((c) => ({ ...c, options: c.options.map((o, i) => (i === index ? { ...o, ...change } : o)) }));

  return (
    <>
      <Text variant="headingMd" accessibilityRole="header">
        {isNew ? 'New command' : `/${initial.name}`}
      </Text>
      <TextField
        label="Name"
        value={command.name}
        onChangeText={(name) => setCommand((c) => ({ ...c, name: name.toLowerCase() }))}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={32}
        autoFocus={isNew}
        hint="What people type after the slash: lowercase letters, numbers, - and _."
      />
      <TextField label="Description" value={command.description} onChangeText={(description) => setCommand((c) => ({ ...c, description }))} maxLength={100} />
      <Stack gap="sm">
        <Text variant="bodySmStrong" tone="onDark">
          Options
        </Text>
        {command.options.length === 0 ? (
          <Text variant="captionMd" tone="muted">
            Options are values people fill in after the command, like a number of minutes.
          </Text>
        ) : null}
        {command.options.map((option, index) => (
          <View key={index} style={{ gap: theme.space.sm, padding: theme.space.md, borderRadius: theme.radii.md, borderWidth: 1, borderColor: theme.colors.hairline, backgroundColor: theme.colors.surface }}>
            <View style={wide ? { flexDirection: 'row', gap: theme.space.sm } : { gap: theme.space.sm }}>
              <View style={{ flex: wide ? 1 : undefined }}>
                <TextField label="Name" value={option.name} onChangeText={(name) => setOption(index, { name: name.toLowerCase() })} autoCapitalize="none" autoCorrect={false} maxLength={32} />
              </View>
              <View style={{ flex: wide ? 2 : undefined }}>
                <TextField label="Description" value={option.description} onChangeText={(description) => setOption(index, { description })} maxLength={100} />
              </View>
            </View>
            <PillTabs options={TYPE_OPTIONS} value={option.type} onChange={(type) => setOption(index, { type })} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Checkbox checked={!!option.required} onChange={(required) => setOption(index, { required })}>
                Required
              </Checkbox>
              <Button title="Remove option" variant="tertiary" size="sm" onPress={() => setCommand((c) => ({ ...c, options: c.options.filter((_, i) => i !== index) }))} />
            </View>
          </View>
        ))}
        <Button
          title="Add option"
          variant="tertiary"
          size="sm"
          disabled={command.options.length >= 10}
          onPress={() => setCommand((c) => ({ ...c, options: [...c.options, { name: '', description: '', type: 'string', required: false }] }))}
          style={{ alignSelf: 'flex-start' }}
        />
      </Stack>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
        {onRemove ? <Button title="Remove command" variant="danger" onPress={onRemove} /> : null}
        <View style={{ flex: 1 }} />
        <Button title="Cancel" variant="tertiary" onPress={onClose} />
        <Button
          title="Done"
          onPress={() => {
            const problem = validateCommandDrafts([command]) ?? (taken.includes(command.name.trim()) ? `There is already a /${command.name.trim()} command.` : null);
            if (problem) return setError(problem);
            onSave(normalizeCommandDrafts([command])[0]!);
          }}
        />
      </View>
    </>
  );
}

function AddToPlaceDialog({ visible, application, onClose }: { visible: boolean; application: Application; onClose: () => void }) {
  const theme = useTheme();
  const places = useMyPlaces();
  const actions = useApplicationActions(application.id);
  const client = useApiClient();
  const inst = useActiveInstance()?.id;
  const table = usePermissionTable();
  // The list of joined places has no permissions; each place's own record does (the same query usePlace uses).
  const details = useQueries({
    queries: (places.data ?? []).map((p) => ({
      queryKey: ['place', inst, p.slug],
      enabled: visible && !!client,
      queryFn: async () => unwrap(await client!.GET('/places/{place}', { params: { path: { place: p.slug } } })),
    })),
  });
  const [pending, setPending] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const loading = places.isPending || details.some((d) => d.isPending);
  const addable = details.flatMap((d) => (d.data && hasPermission(d.data.my_permissions, 'MANAGE_PLACE', table) ? [d.data] : []));
  return (
    <Dialog visible={visible} onClose={onClose}>
      <Text variant="headingMd" accessibilityRole="header">
        Add @{application.bot.username} to a place
      </Text>
      <Text variant="bodySm" tone="muted">
        Places where you have Manage place. The bot joins with the @everyone role; give it more with roles.
      </Text>
      {loading && visible ? <ActivityIndicator /> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {!loading && addable.length === 0 ? (
        <Text variant="bodySm" tone="muted">
          You don&apos;t manage any places yet.
        </Text>
      ) : null}
      {addable.length > 0 ? (
        <ScrollView style={{ maxHeight: 320 }}>
          <ListCard>
            {addable.map((place) => (
              <ListRow
                key={place.id}
                leading={<Avatar name={place.name} uri={place.icon_url} size={32} />}
                title={place.name}
                trailing={
                  added.includes(place.slug) ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Icon name="check" size={14} color={theme.colors.onDark} />
                      <Text variant="captionMd" tone="onDark">
                        Added
                      </Text>
                    </View>
                  ) : (
                    <Button
                      title="Add"
                      variant="outline"
                      size="sm"
                      loading={pending === place.slug}
                      disabled={pending !== null}
                      onPress={async () => {
                        setPending(place.slug);
                        setError(null);
                        try {
                          await actions.addToPlace(place.slug, application.id);
                          setAdded((a) => [...a, place.slug]);
                        } catch (e) {
                          setError(failureMessage(e, `Could not add the bot to ${place.name}. Try again.`));
                        } finally {
                          setPending(null);
                        }
                      }}
                    />
                  )
                }
              />
            ))}
          </ListCard>
        </ScrollView>
      ) : null}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <Button title="Done" variant="tertiary" onPress={onClose} />
      </View>
    </Dialog>
  );
}

function DangerZone({ application }: { application: Application }) {
  const theme = useTheme();
  const actions = useApplicationActions(application.id);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.hairline, paddingTop: theme.space.lg, flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}>
      <Stack gap="none" style={{ flex: 1 }}>
        <Text variant="bodySmStrong" tone="onDark">
          Delete this application
        </Text>
        <Text variant="captionMd" tone="muted">
          The bot leaves every place and its token stops working.
        </Text>
      </Stack>
      <Button title="Delete application" variant="danger" onPress={() => setConfirm(true)} />
      <Dialog visible={confirm} onClose={() => setConfirm(false)}>
        <Text variant="headingMd" accessibilityRole="header">
          Delete {application.name}?
        </Text>
        <Text variant="bodySm" tone="muted">
          @{application.bot.username} leaves every place it is in, its commands disappear and its token stops working. This cannot be undone.
        </Text>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: theme.space.sm }}>
          <Button title="Keep" variant="tertiary" onPress={() => setConfirm(false)} />
          <Button
            title="Delete application"
            variant="danger"
            loading={busy}
            onPress={async () => {
              setBusy(true);
              setError(null);
              try {
                await actions.remove();
                setConfirm(false);
                router.replace('/settings/applications');
              } catch (e) {
                setError(failureMessage(e, 'The application could not be deleted. Try again.'));
              } finally {
                setBusy(false);
              }
            }}
          />
        </View>
      </Dialog>
    </View>
  );
}
