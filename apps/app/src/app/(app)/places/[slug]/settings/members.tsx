import { isTimedOut, timeLeft } from '@gotalk/core';
import { Avatar, Badge, Button, hoverTransition, ListCard, Notice, Stack, Text, TextField, useTheme, type PressState } from '@gotalk/ui';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { MemberModerationDialog, MemberRoles, memberName } from '@/components/moderation';
import { PlaceSettingsPage, usePlaceSettings } from '@/components/place-settings';
import { useMemberSearch, useRoles, type Member, type Role } from '@/lib/moderation';

export default function Members() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { place, access } = usePlaceSettings(slug);
  const allowed = access.can('KICK_MEMBERS') || access.can('BAN_MEMBERS') || access.can('MODERATE_MEMBERS') || access.can('MANAGE_ROLES') || access.can('MANAGE_NICKNAMES');
  const [query, setQuery] = useState('');
  const members = useMemberSearch(place?.slug, query, allowed);
  const roles = useRoles(place?.slug, allowed).data ?? [];
  const [open, setOpen] = useState<string | null>(null);

  if (!place) return null;
  if (!allowed) return <Redirect href={{ pathname: '/places/[slug]/settings', params: { slug: place.slug } }} />;
  const list = members.data?.pages.flatMap((p) => p.items ?? []) ?? [];

  return (
    <PlaceSettingsPage slug={place.slug} title="Members" description={`${place.member_count.toLocaleString()} ${place.member_count === 1 ? 'member' : 'members'}. Choose someone to change their roles or take action.`}>
      <Stack gap="lg">
        <TextField placeholder="Search by name" value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} accessibilityLabel="Search members" />
        {members.isPending ? <ActivityIndicator /> : null}
        {members.isError ? (
          <Notice tone="danger" title="Members could not be loaded.">
            Check your connection and try again.
          </Notice>
        ) : null}
        {members.isSuccess && list.length === 0 ? (
          <Text variant="bodySm" tone="muted">
            {query.trim() ? `Nobody whose name starts with “${query.trim()}”.` : 'No members.'}
          </Text>
        ) : null}
        {list.length > 0 ? (
          <ListCard>
            {list.map((m) => (
              <MemberRow key={m.user.id} member={m} roles={roles} owner={m.user.id === place.owner_id} onPress={() => setOpen(m.user.id)} />
            ))}
          </ListCard>
        ) : null}
        {members.hasNextPage ? <Button title="Load more members" variant="tertiary" loading={members.isFetchingNextPage} onPress={() => void members.fetchNextPage()} /> : null}
      </Stack>
      <MemberModerationDialog slug={place.slug} userId={open} visible={!!open} onClose={() => setOpen(null)} />
    </PlaceSettingsPage>
  );
}

function MemberRow({ member, roles, owner, onPress }: { member: Member; roles: Role[]; owner: boolean; onPress: () => void }) {
  const theme = useTheme();
  const c = theme.colors;
  const name = memberName(member);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${name}, actions`} onPress={onPress} style={({ pressed, hovered }: PressState) => ({ ...hoverTransition, backgroundColor: pressed || hovered ? c.surfaceElevated : 'transparent' })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md, paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md }}>
        <Avatar name={member.user.display_name} uri={member.user.avatar_url} size={36} />
        <Stack gap="none" style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.space.sm }}>
            <Text variant="bodySmStrong" tone="onDark">
              {name}
            </Text>
            {owner ? <Badge label="Owner" /> : null}
            {member.user.bot ? <Badge label="Bot" /> : null}
            {isTimedOut(member) ? <Badge label={`Timed out · ${timeLeft(member.timeout_until)}`} tone="warning" /> : null}
          </View>
          <Text variant="captionMd" tone="muted">
            @{member.user.username} · joined {new Date(member.joined_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
          </Text>
          <MemberRoles member={member} roles={roles} />
        </Stack>
      </View>
    </Pressable>
  );
}
