import { Icon, NavRow, Text, useTheme } from '@gotalk/ui';
import { router, usePathname } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SidebarCallPanel } from '@/components/call-bar';
import { ChannelList } from '@/components/channel-list';
import { contextMenu } from '@/components/context-menu';
import { ConversationNavRow, NewConversationDialog } from '@/components/conversations';
import { CreateBoardDialog } from '@/components/create-board-dialog';
import { InstanceIcon } from '@/components/instance-summary';
import { MenuItem, MenuPopover, MenuSeparator } from '@/components/menu';
import { PlaceMenuPopover, usePlaceMenu } from '@/components/place-menu';
import { PresenceAvatar, PresenceMenuItems, presenceLabels } from '@/components/presence';
import { useMe } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { useConversations, useUnreadConversations } from '@/lib/chat';
import { boardTree, useUnreadCount } from '@/lib/forums';
import { useActiveInstance } from '@/lib/instances';
import { useBoards, useChannels, useMyPlaces, usePlace, usePlaceAccess } from '@/lib/places';
import { useMyStatus } from '@/lib/realtime';

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
  const unreadMessages = useUnreadConversations();
  const inMessages = pathname === '/messages' || pathname.startsWith('/messages/');
  if (!active) return null;

  const link = (key: string, label: string, onPress: () => void, isActive: boolean, children: React.ReactNode) => (
    <Pressable key={key} accessibilityRole="link" accessibilityLabel={label} accessibilityState={{ selected: isActive }} onPress={onPress}>
      {isActive ? (
        <View style={{ position: 'absolute', left: -14, top: 8, bottom: 8, width: 3, borderTopRightRadius: 3, borderBottomRightRadius: 3, backgroundColor: c.onDark }} />
      ) : null}
      {children}
    </Pressable>
  );
  const iconTile = (name: 'compass' | 'plus' | 'search' | 'bell' | 'forum' | 'home', dashed: boolean, isActive: boolean, count = 0) => (
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
        {link('feed', 'Home: topics from your places', () => router.push('/feed'), pathname === '/feed', iconTile('home', false, pathname === '/feed'))}
        {link('messages', unreadMessages > 0 ? `Direct messages, ${unreadMessages} unread` : 'Direct messages', () => router.push('/messages'), inMessages, iconTile('forum', false, inMessages, unreadMessages))}
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
          <PresenceAvatar user={{ id: session.userId, display_name: session.displayName, avatar_url: session.avatarUrl }} size={36} />
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
  const header = useRef<View>(null);
  const [menuAt, setMenuAt] = useState<{ left: number; top: number } | null>(null);
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
        ref={header}
        accessibilityRole="button"
        accessibilityLabel={`${place?.name ?? 'Place'} menu`}
        disabled={menu.items.length === 0}
        // Measured, so the menu sits under the header wherever the window chrome puts it.
        onPress={() => header.current?.measureInWindow((x, y, _w, h) => setMenuAt({ left: x + 8, top: y + h - 8 }))}
        {...(menu.items.length > 0 ? contextMenu((at) => setMenuAt({ left: at.left ?? 0, top: at.top ?? 0 })) : {})}
        style={{ height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: c.hairline }}
      >
        <Text variant="bodyStrong" tone="onDark" numberOfLines={1} style={{ flex: 1 }}>
          {place?.name ?? ''}
        </Text>
        {menu.items.length > 0 ? <Icon name="chevronDown" size={16} color={c.mute} /> : null}
      </Pressable>
      <PlaceMenuPopover items={menu.items} visible={!!menuAt} anchor={menuAt ?? { left: 0, top: 0 }} onClose={() => setMenuAt(null)} />
      {menu.dialogs}
      <CreateBoardDialog slug={slug} visible={newForum} onClose={() => setNewForum(false)} />

      <ScrollView contentContainerStyle={{ padding: 8, gap: 2 }}>
        <NavRow label="Home" icon="home" active={pathname === `/places/${slug}`} onPress={() => router.push({ pathname: '/places/[slug]', params: { slug } })} />
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
        {access.isMember ? <ChannelList slug={slug} channels={channels} canManage={access.can('MANAGE_CHANNELS')} wide /> : null}
        {empty && !access.can('MANAGE_CHANNELS') ? (
          <Text variant="captionMd" tone="muted" style={{ paddingHorizontal: 10, paddingTop: 10 }}>
            No forums or channels yet.
          </Text>
        ) : null}
      </ScrollView>

      <SidebarCallPanel />
      <AccountFooter />
    </View>
  );
}

/** Bottom of the sidebar: who is signed in and how present they look. Opens the presence picker. */
export function AccountFooter() {
  const theme = useTheme();
  const c = theme.colors;
  const session = useSession();
  const me = useMe().data;
  const status = useMyStatus();
  const [open, setOpen] = useState(false);
  if (!session) return null;
  const name = me?.display_name ?? session.displayName;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${presenceLabels[status]}. Change status or open account settings`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderTopWidth: 1, borderTopColor: c.hairline, backgroundColor: pressed ? c.surfaceElevated : 'transparent' })}
      >
        <PresenceAvatar user={{ id: session.userId, display_name: name, avatar_url: me?.avatar_url ?? session.avatarUrl }} size={32} ring={c.surface} />
        <View style={{ flex: 1 }}>
          <Text variant="bodySmStrong" tone="onDark" numberOfLines={1}>
            {name}
          </Text>
          <Text variant="captionMd" tone="muted">
            {presenceLabels[status]}
          </Text>
        </View>
        <Icon name="chevronDown" size={16} color={c.mute} />
      </Pressable>
      <MenuPopover visible={open} onClose={() => setOpen(false)} anchor={{ left: 72, bottom: 56 }}>
        <PresenceMenuItems onDone={() => setOpen(false)} />
        <MenuSeparator />
        <MenuItem
          label="Account settings"
          icon="settings"
          onPress={() => {
            setOpen(false);
            router.push('/settings');
          }}
        />
      </MenuPopover>
    </>
  );
}

/** Second column on wide screens while in direct messages: the conversations. */
export function MessagesSidebar() {
  const theme = useTheme();
  const c = theme.colors;
  const pathname = usePathname();
  const conversations = useConversations();
  const [creating, setCreating] = useState(false);
  const list = conversations.data ?? [];
  return (
    <View style={{ width: 248, backgroundColor: c.surface, borderRightWidth: 1, borderRightColor: c.hairline }}>
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: c.hairline }}>
        <Text variant="bodyStrong" tone="onDark" accessibilityRole="header">
          Direct messages
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="New message" onPress={() => setCreating(true)} hitSlop={8}>
          <Icon name="plus" size={16} color={c.mute} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 8, gap: 2 }}>
        {list.map((ch) => (
          <ConversationNavRow key={ch.id} channel={ch} active={pathname === `/messages/${ch.id}` || pathname.startsWith(`/messages/${ch.id}/`)} />
        ))}
        {conversations.isSuccess && list.length === 0 ? (
          <Text variant="captionMd" tone="muted" style={{ paddingHorizontal: 10, paddingTop: 10 }}>
            No conversations yet. Start one with someone you share a place with.
          </Text>
        ) : null}
      </ScrollView>
      <SidebarCallPanel />
      <AccountFooter />
      <NewConversationDialog visible={creating} onClose={() => setCreating(false)} />
    </View>
  );
}

/** Phone tabs: the Home feed (which also leads to search), places, direct messages, inbox and the account. */
export function TabBar() {
  const theme = useTheme();
  const c = theme.colors;
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const unread = useUnreadCount().data ?? 0;
  const unreadMessages = useUnreadConversations();
  const inMessages = pathname === '/messages' || pathname.startsWith('/messages/');
  const tabs = [
    { label: 'Home', icon: 'home', href: '/feed', active: pathname === '/feed' || pathname === '/search', count: 0 },
    { label: 'Places', icon: 'grid', href: '/home', active: pathname !== '/you' && pathname !== '/inbox' && pathname !== '/search' && pathname !== '/feed' && !inMessages, count: 0 },
    { label: 'Messages', icon: 'forum', href: '/messages', active: inMessages, count: unreadMessages },
    { label: 'Inbox', icon: 'bell', href: '/inbox', active: pathname === '/inbox', count: unread },
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
