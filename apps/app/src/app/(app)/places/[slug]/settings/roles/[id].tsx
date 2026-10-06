import { canManageRole, hasBit, roleMoveTarget, sortRoles, type PermissionTable } from '@gotalk/core';
import { Button, Dialog, Notice, Stack, Text, TextField, useTheme } from '@gotalk/ui';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { PlaceSettingsPage, sectionHref, usePlaceSettings } from '@/components/place-settings';
import { PermissionChecklist, RoleColorPicker } from '@/components/roles';
import { failureMessage } from '@/lib/failure';
import { useModerationActions, useRoles, useStanding, type Role, type RoleInput } from '@/lib/moderation';
import { usePermissionTable, type Place } from '@/lib/places';

type Standing = NonNullable<ReturnType<typeof useStanding>['data']>;

export default function RoleEditor() {
  const { slug, id } = useLocalSearchParams<{ slug: string; id: string }>();
  const { place, access } = usePlaceSettings(slug);
  const allowed = access.can('MANAGE_ROLES');
  const roles = useRoles(place?.slug, allowed);
  const standing = useStanding(place?.slug, allowed);
  const table = usePermissionTable();

  if (!place) return null;
  if (!allowed) return <Redirect href={{ pathname: '/places/[slug]/settings', params: { slug: place.slug } }} />;
  const role = roles.data?.find((r) => r.id === id);
  const back = { label: 'Roles', href: sectionHref(place.slug, 'roles') };

  if (roles.isPending || standing.isPending) {
    return (
      <PlaceSettingsPage slug={place.slug} title="Role" back={back}>
        <ActivityIndicator />
      </PlaceSettingsPage>
    );
  }
  if (!role || !standing.data) {
    return (
      <PlaceSettingsPage slug={place.slug} title="Role" back={back}>
        <Notice tone="danger" title="This role no longer exists.">
          Someone may have deleted it. Pick another from the list.
        </Notice>
      </PlaceSettingsPage>
    );
  }
  return <RoleForm key={role.id} place={place} role={role} roles={roles.data ?? []} standing={standing.data} table={table} back={back} />;
}

function RoleForm({ place, role, roles, standing, table, back }: { place: Place; role: Role; roles: Role[]; standing: Standing; table: PermissionTable; back: { label: string; href: ReturnType<typeof sectionHref> } }) {
  const theme = useTheme();
  const actions = useModerationActions(place.slug);
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color);
  const [bits, setBits] = useState(role.permissions);
  const [busy, setBusy] = useState<'save' | 'move' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const manageable = canManageRole(role, standing);
  // Owners and administrators hold every permission, so they can grant any of them.
  const grantable = standing.is_owner || hasBit(standing.permissions, 'ADMINISTRATOR', table) ? null : standing.permissions;
  const dirty = name.trim() !== role.name || color !== role.color || bits !== role.permissions;
  const ordered = sortRoles(roles);
  const up = roleMoveTarget(ordered, role.id, -1, standing);
  const down = roleMoveTarget(ordered, role.id, 1, standing);

  async function run(kind: 'save' | 'move' | 'delete', work: () => Promise<unknown>, fallback: string) {
    setBusy(kind);
    setError(null);
    setSaved(false);
    try {
      await work();
      return true;
    } catch (e) {
      setError(failureMessage(e, fallback));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    const finalName = name.trim();
    if (!role.is_default && !finalName) return setError('Give the role a name.');
    const input: RoleInput = {};
    if (!role.is_default && finalName !== role.name) input.name = finalName;
    if (color !== role.color) input.color = color;
    if (bits !== role.permissions) input.permissions = bits;
    if (await run('save', () => actions.updateRole(role.id, input), 'Could not save the role. Try again.')) setSaved(true);
  }

  function discard() {
    setName(role.name);
    setColor(role.color);
    setBits(role.permissions);
    setError(null);
  }

  const buttons = manageable ? (
    <>
      <Button title="Save changes" onPress={save} loading={busy === 'save'} disabled={!dirty} />
      <Button title="Discard" variant="tertiary" onPress={discard} disabled={!dirty || busy !== null} />
    </>
  ) : null;

  return (
    <PlaceSettingsPage slug={place.slug} title={role.name} back={back} actions={buttons}>
      <Stack gap="xl">
        {!manageable ? (
          <Notice tone="info" title="This role ranks at or above your highest role.">
            You can see its permissions, but only someone ranked above it can change them.
          </Notice>
        ) : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {saved && !dirty ? <Notice tone="success">Saved. Members with this role have the new permissions now.</Notice> : null}

        {role.is_default ? (
          <Text variant="bodySm" tone="muted">
            Everyone in the place has this role. It cannot be renamed, moved or deleted; its permissions are what every member starts with.
          </Text>
        ) : (
          <>
            <TextField label="Name" value={name} onChangeText={setName} maxLength={64} editable={manageable} />
            <Stack gap="xs">
              <Text variant="bodySmStrong" tone="onDark">
                Color
              </Text>
              <RoleColorPicker value={color} onChange={setColor} disabled={!manageable} />
              <Text variant="captionMd" tone="muted">
                Shown as a dot beside the role&apos;s name.
              </Text>
            </Stack>
            {manageable && (up !== null || down !== null) ? (
              <Stack gap="xs">
                <Text variant="bodySmStrong" tone="onDark">
                  Rank
                </Text>
                <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
                  <Button title="Move up" variant="tertiary" size="sm" disabled={up === null || busy !== null} onPress={() => up !== null && void run('move', () => actions.updateRole(role.id, { position: up }), 'Could not move the role. Try again.')} />
                  <Button title="Move down" variant="tertiary" size="sm" disabled={down === null || busy !== null} onPress={() => down !== null && void run('move', () => actions.updateRole(role.id, { position: down }), 'Could not move the role. Try again.')} />
                </View>
              </Stack>
            ) : null}
          </>
        )}

        <Stack gap="md">
          <Text variant="headingSm" accessibilityRole="header">
            Permissions
          </Text>
          {hasBit(bits, 'ADMINISTRATOR', table) ? (
            <Notice tone="warning">Administrator gives every permission and ignores the overrides of forums and channels.</Notice>
          ) : null}
          <PermissionChecklist bits={bits} onChange={setBits} table={table} grantable={grantable} disabled={!manageable} />
        </Stack>

        {manageable ? <View style={{ flexDirection: 'row', gap: theme.space.sm }}>{buttons}</View> : null}

        {manageable && !role.is_default ? (
          <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.hairline, paddingTop: theme.space.lg, flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}>
            <Stack gap="none" style={{ flex: 1 }}>
              <Text variant="bodySmStrong" tone="onDark">
                Delete this role
              </Text>
              <Text variant="captionMd" tone="muted">
                Members with it lose its permissions.
              </Text>
            </Stack>
            <Button title="Delete role" variant="danger" onPress={() => setConfirmDelete(true)} />
          </View>
        ) : null}
      </Stack>

      <Dialog visible={confirmDelete} onClose={() => setConfirmDelete(false)}>
        <Text variant="headingMd" accessibilityRole="header">
          Delete {role.name}?
        </Text>
        <Text variant="bodySm" tone="muted">
          Everyone with this role loses its permissions, and its overrides in forums and channels are removed. This cannot be undone.
        </Text>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: theme.space.sm }}>
          <Button title="Keep" variant="tertiary" onPress={() => setConfirmDelete(false)} />
          <Button
            title="Delete role"
            variant="danger"
            loading={busy === 'delete'}
            onPress={async () => {
              if (await run('delete', () => actions.deleteRole(role.id), 'Could not delete the role. Try again.')) {
                setConfirmDelete(false);
                router.replace(back.href);
              }
            }}
          />
        </View>
      </Dialog>
    </PlaceSettingsPage>
  );
}
