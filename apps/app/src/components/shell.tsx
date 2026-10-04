import { Avatar, Icon, NavRow, Text, useTheme } from '@gotalk/ui';
import { router, usePathname } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CreateBoardDialog } from '@/components/create-board-dialog';
import { InstanceIcon } from '@/components/instance-summary';
import { PlaceMenuPopover, usePlaceMenu } from '@/components/place-menu';
import { useMe } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { boardTree, useUnreadCount } from '@/lib/forums';
import { useActiveInstance } from '@/lib/instances';
import { useBoards, useChannels, useMyPlaces, usePlace, usePlaceAccess } from '@/lib/places';

/** A small white count, like every other count in the shell. */
function CountBadge({ count, style }: { count: number; style?: object }) {
  const theme = useTheme();
  if (count <= 0) return null;
  return (
    <View style={[{ minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text variant="captionSm" tone="inverse" style={{ lineHeight: 14, fontSize: 11 }}>
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  );
}

/** The place a path belongs to, e.g. `/places/open-woodworkers/settings` -> `open-woodworkers`. */
export function useRouteSlug(): string | undefined {
  const match = /^\/places\/([^/]+)/.exec(usePathname());
  return match && match[1] !== 'new' ? decodeURIComponent(match[1]!) : undefined;
}

/** Far-left column on wide screens: one tile per joined place, plus Discover, Create and the account. */
export function PlaceRail({ onOpenPalette }: { onOpenPalette: () => void }) {
  const theme = useTheme();
  const c = theme.colors;
  const pathname = usePathname();
  const slug = useRouteSlug();
  const active = useActiveInstance();
  const session = useSession();
  const places = useMyPlaces().data ?? [];
  const unread = useUnreadCount().data ?? 0;
  if (!active) return null;

  const link = (key: string, label: string, onPress: () => void, isActive: boolean, children: React.ReactNode) => (
    <Pressable key={key} accessibilityRole="link" accessibilityLabel={label} accessibilityState={{ selected: isActive }} onPress={onPress}>
      {isActive ? (
        <View style={{ position: 'absolute', left: -14, top: 8, bottom: 8, width: 3, borderTopRightRadius: 3, borderBottomRightRadius: 3, backgroundColor: c.onDark }} />
      ) : null}
      {children}
    </Pressable>
  );
  const iconTile = (name: 'compass' | 'plus' | 'search' | 'bell', dashed: boolean, isActive: boolean, count = 0) => (
    <View
      style={{
        width: 48,
        height: 48,
        borderRadius: theme.radii.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isActive ? c.surfaceElevated : 'transparent',
        borderWidth: dashed ? 1 : 0,
        borderStyle: 'dashed',
        borderColor: c.hairlineStrong,
      }}
    >
      <Icon name={name} size={20} color={isActive ? c.onDark : c.mute} />
      <CountBadge count={count} style={{ position: 'absolute', right: -4, bottom: -4, borderWidth: 2, borderColor: c.canvas, boxSizing: 'content-box' }} />
    </View>
  );

  return (
    <View style={{ width: 64, backgroundColor: c.canvas, borderRightWidth: 1, borderRightColor: c.hairline, paddingVertical: 12, alignItems: 'center' }}>
      <ScrollView contentContainerStyle={{ alignItems: 'center', gap: 10 }} showsVerticalScrollIndicator={false}>
        {link('palette', 'Jump to a place or channel', onOpenPalette, false, iconTile('search', false, false))}
        {link('inbox', unread > 0 ? `Inbox, ${unread} unread` : 'Inbox', () => router.push('/inbox'), pathname === '/inbox', iconTile('bell', false, pathname === '/inbox', unread))}
        {places.map((p) =>
          link(p.id, p.name, () => router.push({ pathname: '/places/[slug]', params: { slug: p.slug } }), p.slug === slug, <InstanceIcon name={p.name} iconUrl={p.icon_url} origin={active.origin} size={48} />),
        )}
        {link('discover', 'Discover places', () => router.push('/discover'), pathname === '/discover', iconTile('compass', false, pathname === '/discover'))}
        {link('new', 'Create a place', () => router.push('/places/new'), pathname === '/places/new', iconTile('plus', true, pathname === '/places/new'))}
      </ScrollView>
      {session ? (
        <Pressable accessibilityRole="link" accessibilityLabel="Account and instances" onPress={() => router.push('/you')} style={{ marginTop: 8 }}>
          <Avatar name={session.displayName} uri={session.avatarUrl} size={36} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Second column on wide screens: the open place's forums, chat and voice channels. */
export function PlaceSidebar({ slug }: { slug: string }) {
  const theme = useTheme();
  const c = theme.colors;
  const pathname = usePathname();
  const place = usePlace(slug).data;
  const access = usePlaceAccess(place);
  const boardNodes = boardTree(useBoards(slug, access.isMember).data ?? []);
  const channels = useChannels(slug, access.isMember).data ?? [];
  const menu = usePlaceMenu(place);
  const session = useSession();
  const me = useMe().data;
  const [menuOpen, setMenuOpen] = useState(false);
  const [newForum, setNewForum] = useState(false);

  const text = channels.filter((ch) => ch.kind === 'text');
  const voice = channels.filter((ch) => ch.kind === 'voice');
  const empty = access.isMember && boardNodes.length === 0 && text.length === 0 && voice.length === 0;
  const section = (label: string) => (
    <Text variant="captionMd" tone="muted" style={{ paddingHorizontal: 10, paddingTop: 10, paddingBottom: 2 }}>
      {label}
    </Text>
  );

  return (
    <View style={{ width: 248, backgroundColor: c.surface, borderRightWidth: 1, borderRightColor: c.hairline }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${place?.name ?? 'Place'} menu`}
        disabled={menu.items.length === 0}
        onPress={() => setMenuOpen(true)}
        style={{ height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: c.hairline }}
      >
        <Text variant="bodyStrong" tone="onDark" numberOfLines={1} style={{ flex: 1 }}>
          {place?.name ?? ''}
        </Text>
        {menu.items.length > 0 ? <Icon name="chevronDown" size={16} color={c.mute} /> : null}
      </Pressable>
      <PlaceMenuPopover items={menu.items} visible={menuOpen} onClose={() => setMenuOpen(false)} />
      {menu.dialogs}
      <CreateBoardDialog slug={slug} visible={newForum} onClose={() => setNewForum(false)} />

      <ScrollView contentContainerStyle={{ padding: 8, gap: 2 }}>
        <NavRow label="Overview" icon="home" active={pathname === `/places/${slug}`} onPress={() => router.push({ pathname: '/places/[slug]', params: { slug } })} />
        {access.isMember ? <NavRow label="Search" icon="search" active={pathname === `/places/${slug}/search`} onPress={() => router.push({ pathname: '/places/[slug]/search', params: { slug } })} /> : null}
        {boardNodes.length > 0 ? section('Forums') : null}
        {boardNodes.map(({ board: b, depth }) => (
          <View key={b.id} style={{ marginLeft: depth * 12 }}>
            {b.kind === 'category' ? (
              <Text variant="captionMd" tone="muted" style={{ paddingHorizontal: 10, paddingTop: 8, paddingBottom: 2 }}>
                {b.name}
              </Text>
            ) : (
              <NavRow label={b.name} icon="forum" active={pathname === `/places/${slug}/boards/${b.id}` || pathname.startsWith(`/places/${slug}/boards/${b.id}/`)} onPress={() => router.push({ pathname: '/places/[slug]/boards/[id]', params: { slug, id: b.id } })} />
            )}
          </View>
        ))}
        {access.can('MANAGE_BOARDS') ? <NavRow label="New forum" icon="plus" onPress={() => setNewForum(true)} /> : null}
        {text.length > 0 ? section('Chat') : null}
        {text.map((ch) => (
          <NavRow key={ch.id} label={ch.name} icon="hash" active={pathname === `/places/${slug}/channels/${ch.id}`} onPress={() => router.push({ pathname: '/places/[slug]/channels/[id]', params: { slug, id: ch.id } })} />
        ))}
        {voice.length > 0 ? section('Voice') : null}
        {voice.map((ch) => (
          <NavRow key={ch.id} label={ch.name} icon="volume" active={pathname === `/places/${slug}/channels/${ch.id}`} onPress={() => router.push({ pathname: '/places/[slug]/channels/[id]', params: { slug, id: ch.id } })} />
        ))}
        {empty ? (
          <Text variant="captionMd" tone="muted" style={{ paddingHorizontal: 10, paddingTop: 10 }}>
            No forums or channels yet.
          </Text>
        ) : null}
      </ScrollView>

      {session ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Account settings"
          onPress={() => router.push('/settings')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderTopWidth: 1, borderTopColor: c.hairline }}
        >
          <Avatar name={me?.display_name ?? session.displayName} uri={me?.avatar_url ?? session.avatarUrl} size={32} />
          <View style={{ flex: 1 }}>
            <Text variant="bodySmStrong" tone="onDark" numberOfLines={1}>
              {me?.display_name ?? session.displayName}
            </Text>
            <Text variant="captionMd" tone="muted">
              @{session.username}
            </Text>
          </View>
          <Icon name="settings" size={16} color={c.mute} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Phone tabs: places, inbox, search and the account. */
export function TabBar() {
  const theme = useTheme();
  const c = theme.colors;
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const unread = useUnreadCount().data ?? 0;
  const tabs = [
    { label: 'Places', icon: 'home', href: '/home', active: pathname !== '/you' && pathname !== '/inbox' && pathname !== '/search', count: 0 },
    { label: 'Inbox', icon: 'bell', href: '/inbox', active: pathname === '/inbox', count: unread },
    { label: 'Search', icon: 'search', href: '/search', active: pathname === '/search', count: 0 },
    { label: 'You', icon: 'user', href: '/you', active: pathname === '/you', count: 0 },
  ] as const;
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.hairline, backgroundColor: c.canvas, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 8) }}
    >
      {tabs.map((t) => (
        <Pressable key={t.label} accessibilityRole="tab" accessibilityLabel={t.count > 0 ? `${t.label}, ${t.count} unread` : t.label} accessibilityState={{ selected: t.active }} onPress={() => router.navigate(t.href)} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
          <View>
            <Icon name={t.icon} size={22} color={t.active ? c.onDark : c.mute} />
            <CountBadge count={t.count} style={{ position: 'absolute', right: -10, top: -6, height: 16, minWidth: 16 }} />
          </View>
          <Text variant="captionSm" tone={t.active ? 'onDark' : 'muted'}>
            {t.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
