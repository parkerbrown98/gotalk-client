import {
  canManageRole,
  hasBit,
  overwritablePermissions,
  overwriteCounts,
  overwriteState,
  permissionInfo,
  setOverwriteState,
  sortRoles,
  type OverwriteBits,
  type OverwriteScope,
  type PermissionTable,
} from '@gotalk/core';
import { Badge, Button, Card, Notice, Stack, Text, useTheme } from '@gotalk/ui';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { MenuItem, MenuPopover, type Anchor } from '@/components/menu';
import { PlaceSettingsPage, sectionHref, usePlaceSettings } from '@/components/place-settings';
import { RoleDot, TriState } from '@/components/roles';
import { failureMessage } from '@/lib/failure';
import { useWide } from '@/lib/layout';
import { useModerationActions, useOverwrites, useRoles, useStanding, type Overwrite, type OverwriteKind, type Role } from '@/lib/moderation';
import { useBoardAccess, useBoards, useChannelAccess, useChannels, usePermissionTable, type Board, type Channel } from '@/lib/places';

export default function OverwriteEditor() {
  const { slug, id, kind: kindParam } = useLocalSearchParams<{ slug: string; id: string; kind?: string }>();
  const kind: OverwriteKind = kindParam === 'board' ? 'board' : 'channel';
  const { place } = usePlaceSettings(slug);
  const board = useBoards(place?.slug, kind === 'board').data?.find((b) => b.id === id);
  const channels = useChannels(place?.slug, kind === 'channel');
  const channel = channels.data?.find((c) => c.id === id);
  const boardAccess = useBoardAccess(board);
  const channelAccess = useChannelAccess(channel);
  const target: Board | Channel | undefined = kind === 'board' ? board : channel;
  const allowed = kind === 'board' ? boardAccess.can('MANAGE_BOARDS') : channelAccess.can('MANAGE_CHANNELS');
  const overwrites = useOverwrites(kind, id, allowed);
  const roles = useRoles(place?.slug, allowed);
  const standing = useStanding(place?.slug, allowed).data;
  const table = usePermissionTable();

  if (!place) return null;
  const back = { label: 'Permissions', href: sectionHref(place.slug, 'permissions') };
  if (!target) {
    return (
      <PlaceSettingsPage slug={place.slug} title="Permissions" back={back}>
        {channels.isPending ? <ActivityIndicator /> : <Notice tone="danger" title="This forum or channel no longer exists.">Pick another from the list.</Notice>}
      </PlaceSettingsPage>
    );
  }
  if (!allowed) return <Redirect href={back.href} />;

  const scope: OverwriteScope = kind === 'board' ? 'board' : (target as Channel).kind === 'voice' ? 'voice' : (target as Channel).kind === 'category' ? 'category' : 'text';
  const title = kind === 'board' ? target.name : scope === 'text' ? `#${target.name}` : target.name;

  return (
    <PlaceSettingsPage
      slug={place.slug}
      title={`${title} permissions`}
      back={back}
      description="The @everyone override applies first, then the overrides of a member's other roles together: an allow on any of their roles beats a deny on another. Owners and administrators are not affected."
    >
      {overwrites.isPending || roles.isPending ? <ActivityIndicator /> : null}
      {overwrites.isError ? <Notice tone="danger">The overrides could not be loaded. Try again in a moment.</Notice> : null}
      {overwrites.data && roles.data ? (
        <Overrides
          key={target.id}
          slug={place.slug}
          kind={kind}
          targetId={target.id}
          scope={scope}
          category={target.kind === 'category'}
          overwrites={overwrites.data}
          roles={roles.data}
          standing={standing}
          table={table}
          // What the editor holds here: the server refuses to allow or deny anything else.
          held={target.my_permissions ?? 0}
        />
      ) : null}
    </PlaceSettingsPage>
  );
}

function Overrides({
  slug,
  kind,
  targetId,
  scope,
  category,
  overwrites,
  roles,
  standing,
  table,
  held,
}: {
  slug: string;
  kind: OverwriteKind;
  targetId: string;
  scope: OverwriteScope;
  category: boolean;
  overwrites: Overwrite[];
  roles: Role[];
  standing: ReturnType<typeof useStanding>['data'];
  table: PermissionTable;
  held: number;
}) {
  const theme = useTheme();
  const [added, setAdded] = useState<string[]>([]);
  const [menu, setMenu] = useState<Anchor | null>(null);
  const ordered = sortRoles(roles);
  const byRole = new Map(overwrites.map((o) => [o.role_id, o]));
  // @everyone first: it applies before the others.
  const shown = [...ordered.filter((r) => r.is_default), ...ordered.filter((r) => !r.is_default)].filter((r) => byRole.has(r.id) || added.includes(r.id));
  const editable = (r: Role) => r.is_default || canManageRole(r, standing);
  const addable = ordered.filter((r) => !byRole.has(r.id) && !added.includes(r.id) && editable(r));
  const names = overwritablePermissions(scope).filter((n) => n in table);

  return (
    <Stack gap="lg">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.space.md }}>
        <Text variant="captionMd" tone="muted" style={{ flex: 1 }}>
          {category
            ? 'Applies to every channel in this category, unless a channel overrides it again.'
            : kind === 'board'
              ? 'Applies to this forum and the forums inside it.'
              : scope === 'voice'
                ? 'Voice channels offer voice permissions.'
                : 'Text channels offer chat permissions.'}
        </Text>
        <Button
          title="Add a role"
          variant="tertiary"
          size="sm"
          disabled={addable.length === 0}
          onPress={(e) => {
            const { pageX, pageY } = e.nativeEvent;
            setMenu({ left: pageX - 200, top: pageY + 16, flipAt: pageY - 16 });
          }}
        />
      </View>
      <MenuPopover visible={!!menu} onClose={() => setMenu(null)} anchor={menu ?? {}} width={232}>
        {addable.map((r) => (
          <MenuItem
            key={r.id}
            label={r.name}
            leading={<View style={{ width: 16, alignItems: 'center' }}><RoleDot color={r.color} /></View>}
            onPress={() => {
              setMenu(null);
              setAdded((a) => [...a, r.id]);
            }}
          />
        ))}
      </MenuPopover>
      {shown.length === 0 ? (
        <Text variant="bodySm" tone="muted">
          No overrides. Every role has its usual permissions here. Add a role to change what it can do in this {kind === 'board' ? 'forum' : category ? 'category' : 'channel'}.
        </Text>
      ) : null}
      {shown.map((r) => (
        <OverrideCard
          key={r.id}
          slug={slug}
          kind={kind}
          targetId={targetId}
          role={r}
          saved={byRole.get(r.id)}
          names={names}
          table={table}
          held={held}
          canEdit={editable(r)}
          onCancel={() => setAdded((a) => a.filter((x) => x !== r.id))}
        />
      ))}
    </Stack>
  );
}

function OverrideCard({
  slug,
  kind,
  targetId,
  role,
  saved,
  names,
  table,
  held,
  canEdit,
  onCancel,
}: {
  slug: string;
  kind: OverwriteKind;
  targetId: string;
  role: Role;
  saved: Overwrite | undefined;
  names: string[];
  table: PermissionTable;
  held: number;
  canEdit: boolean;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const wide = useWide();
  const actions = useModerationActions(slug);
  const [bits, setBits] = useState<OverwriteBits>(() => ({ allow: saved?.allow ?? 0, deny: saved?.deny ?? 0 }));
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dirty = !saved || bits.allow !== saved.allow || bits.deny !== saved.deny;
  const counts = overwriteCounts(bits, names, table);

  async function run(kindOf: 'save' | 'remove', work: () => Promise<unknown>, fallback: string) {
    setBusy(kindOf);
    setError(null);
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

  return (
    <Card compact>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.space.sm }}>
        <RoleDot color={role.color} />
        <Text variant="bodySmStrong" tone="onDark">
          {role.name}
        </Text>
        {counts.allowed > 0 ? <Badge label={`${counts.allowed} allowed`} tone="success" /> : null}
        {counts.denied > 0 ? <Badge label={`${counts.denied} denied`} tone="danger" /> : null}
        {!saved ? <Badge label="Not saved" /> : null}
        <View style={{ flex: 1 }} />
        {canEdit && dirty ? <Button title="Save" variant="outline" size="sm" loading={busy === 'save'} onPress={() => void run('save', () => actions.setOverwrite(kind, targetId, role.id, bits), 'Could not save the override. Try again.')} /> : null}
        {canEdit && saved ? (
          <Button title="Remove override" variant="tertiary" size="sm" loading={busy === 'remove'} onPress={async () => {
              if (await run('remove', () => actions.removeOverwrite(kind, targetId, role.id), 'Could not remove the override. Try again.')) onCancel();
            }} />
        ) : null}
        {!saved ? <Button title="Cancel" variant="tertiary" size="sm" onPress={onCancel} /> : null}
      </View>
      {!canEdit ? (
        <Text variant="captionMd" tone="muted">
          This role ranks at or above your highest role, so you cannot change its override.
        </Text>
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <View style={{ gap: theme.space.sm }}>
        {names.map((name) => {
          const info = permissionInfo(name);
          const locked = !hasBit(held, name, table);
          return (
            <View
              key={name}
              style={wide ? { flexDirection: 'row', alignItems: 'center', gap: theme.space.md } : { gap: 4 }}
            >
              <View style={{ flex: wide ? 1 : undefined }}>
                <Text variant="bodySm" tone="onDark">
                  {info.label}
                </Text>
                {locked && canEdit ? (
                  <Text variant="captionMd" tone="muted">
                    You don&apos;t have this permission here.
                  </Text>
                ) : null}
              </View>
              <TriState label={info.label} value={overwriteState(bits, name, table)} disabled={!canEdit || locked} onChange={(state) => setBits((b) => setOverwriteState(b, name, state, table))} />
            </View>
          );
        })}
      </View>
    </Card>
  );
}
