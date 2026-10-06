import { canManageRole, countPermissions, hasBit, roleMoveTarget, sortRoles } from '@gotalk/core';
import { Button, Icon, ListCard, ListRow, Notice, Stack, Text, useTheme } from '@gotalk/ui';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { PlaceSettingsPage, usePlaceSettings } from '@/components/place-settings';
import { RoleDot } from '@/components/roles';
import { failureMessage } from '@/lib/failure';
import { useWide } from '@/lib/layout';
import { useModerationActions, useRoles, useStanding, type Role } from '@/lib/moderation';
import { usePermissionTable } from '@/lib/places';

export default function Roles() {
  const theme = useTheme();
  const wide = useWide();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { place, access } = usePlaceSettings(slug);
  const allowed = access.can('MANAGE_ROLES');
  const roles = useRoles(place?.slug, allowed);
  const standing = useStanding(place?.slug, allowed).data;
  const table = usePermissionTable();
  const actions = useModerationActions(place?.slug);
  const [creating, setCreating] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  if (!place) return null;
  if (!allowed) return <Redirect href={{ pathname: '/places/[slug]/settings', params: { slug: place.slug } }} />;
  const list = sortRoles(roles.data ?? []);
  const names = Object.keys(table);
  const open = (role: Role) => router.push({ pathname: '/places/[slug]/settings/roles/[id]', params: { slug: place.slug, id: role.id } });

  async function create() {
    setCreating(true);
    setProblem(null);
    try {
      const role = await actions.createRole({ name: 'New role' });
      open(role);
    } catch (e) {
      setProblem(failureMessage(e, 'Could not create the role. Try again.'));
    } finally {
      setCreating(false);
    }
  }

  async function move(role: Role, direction: -1 | 1) {
    const position = roleMoveTarget(list, role.id, direction, standing);
    if (position === null) return;
    setMoving(role.id);
    setProblem(null);
    try {
      await actions.updateRole(role.id, { position });
    } catch (e) {
      setProblem(failureMessage(e, 'Could not move the role. Try again.'));
    } finally {
      setMoving(null);
    }
  }

  const arrow = (role: Role, direction: -1 | 1) => {
    const can = roleMoveTarget(list, role.id, direction, standing) !== null && moving === null;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Move ${role.name} ${direction < 0 ? 'up' : 'down'}`}
        accessibilityState={{ disabled: !can }}
        disabled={!can}
        hitSlop={6}
        onPress={() => void move(role, direction)}
        style={{ padding: 4, opacity: can ? 1 : 0.3 }}
      >
        <Icon name={direction < 0 ? 'arrowUp' : 'arrowDown'} size={16} color={theme.colors.mute} />
      </Pressable>
    );
  };

  return (
    <PlaceSettingsPage
      slug={place.slug}
      title="Roles"
      description="Members get the permissions of all their roles. Higher roles outrank lower ones: you can only edit, assign or move roles below your highest role."
      actions={<Button title="Create role" onPress={create} loading={creating} />}
    >
      <Stack gap="lg">
        {problem ? <Notice tone="danger">{problem}</Notice> : null}
        {roles.isPending ? <ActivityIndicator /> : null}
        {roles.isError ? (
          <Notice tone="danger" title="Roles could not be loaded.">
            Check your connection and try again.
          </Notice>
        ) : null}
        {list.length > 0 ? (
          <ListCard>
            {list.map((role) => {
              const manageable = canManageRole(role, standing);
              const count = countPermissions(role.permissions, names, table);
              const summary = hasBit(role.permissions, 'ADMINISTRATOR', table) ? 'Administrator' : `${count} ${count === 1 ? 'permission' : 'permissions'}`;
              return (
                <ListRow
                  key={role.id}
                  leading={
                    <View style={{ width: 16, alignItems: 'center' }}>
                      {manageable || role.is_default ? <RoleDot color={role.color} /> : <Icon name="lock" size={14} color={theme.colors.mute} />}
                    </View>
                  }
                  title={role.name}
                  subtitle={role.is_default ? `Everyone in the place · ${summary}` : manageable ? summary : `Above your highest role · ${summary}`}
                  trailing={
                    wide && manageable && !role.is_default ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                        {moving === role.id ? <ActivityIndicator size="small" /> : null}
                        {arrow(role, -1)}
                        {arrow(role, 1)}
                      </View>
                    ) : undefined
                  }
                  chevron
                  onPress={() => open(role)}
                />
              );
            })}
          </ListCard>
        ) : null}
        <Text variant="captionMd" tone="muted">
          @everyone always comes last. Its permissions are what every member starts with, and what signed-out visitors may read in public forums.
        </Text>
      </Stack>
    </PlaceSettingsPage>
  );
}
