import { conversationTitle, relativeTime, type Message } from '@gotalk/core';
import { Avatar, Icon, Notice, Text, useTheme } from '@gotalk/ui';
import { router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { ChatView } from '@/components/chat-view';
import { Markdown } from '@/components/markdown';
import { MenuItem, MenuPopover, MenuSeparator, type Anchor } from '@/components/menu';
import { MemberModerationDialog, ReportDialog } from '@/components/moderation';
import { PresenceAvatar, presenceLabels } from '@/components/presence';
import { useSession } from '@/lib/auth';
import { useChannel, useChatActions, useMessage, usePins, usePlaceMembers, type Channel } from '@/lib/chat';
import { failureMessage } from '@/lib/failure';
import { usePlace, usePlaceAccess } from '@/lib/places';
import { usePresences } from '@/lib/realtime';

/** The right-hand column on wide screens: members, pins or a thread. */
export function SidePanel({ title, onClose, children, width = 232 }: { title?: string; onClose?: () => void; children: ReactNode; width?: number }) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <View style={{ width, borderLeftWidth: 1, borderLeftColor: c.hairline, backgroundColor: c.surface }}>
      {title ? (
        <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: c.hairline }}>
          <Text variant="bodyStrong" tone="onDark" accessibilityRole="header">
            {title}
          </Text>
          {onClose ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Close ${title.toLowerCase()}`} onPress={onClose} hitSlop={8}>
              <Icon name="x" size={16} color={c.mute} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** Opens (or creates) the direct conversation with someone and shows it. */
export function useMessageSomeone() {
  const actions = useChatActions();
  const myId = useSession()?.userId;
  const [problem, setProblem] = useState<string | null>(null);
  return {
    problem,
    start: async (userId: string) => {
      if (!actions || userId === myId) return;
      setProblem(null);
      try {
        const channel = await actions.openConversation([userId]);
        router.push({ pathname: '/messages/[id]', params: { id: channel.id } });
      } catch (e) {
        setProblem(failureMessage(e, 'Could not open the conversation. Try again.'));
      }
    },
  };
}

/** Who is here: online first, with presence. Choosing someone offers a message, a report, or moderation. */
export function MembersPanel({ slug }: { slug: string }) {
  const theme = useTheme();
  const members = usePlaceMembers(slug, true);
  const list = useMemo(() => members.data ?? [], [members.data]);
  const presence = usePresences(list.map((m) => m.user.id));
  const myId = useSession()?.userId;
  const message = useMessageSomeone();
  const place = usePlace(slug).data;
  const access = usePlaceAccess(place);
  const canModerate = access.can('KICK_MEMBERS') || access.can('BAN_MEMBERS') || access.can('MODERATE_MEMBERS') || access.can('MANAGE_ROLES') || access.can('MANAGE_NICKNAMES');
  const [menu, setMenu] = useState<{ userId: string; name: string; anchor: Anchor } | null>(null);
  const [reporting, setReporting] = useState<{ userId: string; name: string } | null>(null);
  const [moderating, setModerating] = useState<string | null>(null);
  const online = list.filter((m) => presence[m.user.id] && presence[m.user.id] !== 'offline');
  const offline = list.filter((m) => !presence[m.user.id] || presence[m.user.id] === 'offline');

  const row = (m: (typeof list)[number], dim: boolean) => {
    const status = presence[m.user.id];
    const label = m.nickname ?? m.user.display_name;
    const self = m.user.id === myId;
    return (
      <Pressable
        key={m.user.id}
        accessibilityRole="button"
        accessibilityLabel={self ? `${label} (you)` : label}
        disabled={self && !canModerate}
        onPress={(e) => {
          const { pageX, pageY } = e.nativeEvent;
          setMenu({ userId: m.user.id, name: label, anchor: { left: pageX - 240, top: pageY + 8, flipAt: pageY - 8 } });
        }}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 6, borderRadius: theme.radii.sm, backgroundColor: pressed ? theme.colors.surfaceCard : 'transparent' })}
      >
        <PresenceAvatar user={m.user} size={24} ring={theme.colors.surface} />
        <Text variant="bodySm" tone={dim ? 'muted' : 'default'} numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </Text>
        {status === 'idle' || status === 'dnd' ? (
          <Text variant="captionMd" tone="muted">
            {status === 'idle' ? 'Away' : 'Busy'}
          </Text>
        ) : null}
      </Pressable>
    );
  };

  const self = menu?.userId === myId;
  return (
    <SidePanel>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 12, gap: 2 }}>
        {members.isPending ? <ActivityIndicator /> : null}
        {message.problem ? <Notice tone="danger">{message.problem}</Notice> : null}
        <Text variant="captionMd" tone="muted" style={{ paddingHorizontal: 10, paddingVertical: 4 }}>
          Online · {online.length}
        </Text>
        {online.map((m) => row(m, false))}
        <Text variant="captionMd" tone="muted" style={{ paddingHorizontal: 10, paddingTop: 12, paddingBottom: 4 }}>
          Offline · {offline.length}
        </Text>
        {offline.map((m) => row(m, true))}
      </ScrollView>
      <MenuPopover visible={!!menu} onClose={() => setMenu(null)} anchor={menu?.anchor ?? {}}>
        {menu && !self ? (
          <MenuItem
            label="Send a message"
            icon="forum"
            onPress={() => {
              setMenu(null);
              void message.start(menu.userId);
            }}
          />
        ) : null}
        {menu && canModerate ? (
          <MenuItem
            label={self ? 'Roles and nickname' : 'Moderate'}
            icon="shield"
            onPress={() => {
              setMenu(null);
              setModerating(menu.userId);
            }}
          />
        ) : null}
        {menu && !self ? (
          <>
            <MenuSeparator />
            <MenuItem
              label={`Report ${menu.name}`}
              icon="flag"
              danger
              onPress={() => {
                setMenu(null);
                setReporting({ userId: menu.userId, name: menu.name });
              }}
            />
          </>
        ) : null}
      </MenuPopover>
      <ReportDialog place={slug} target={reporting ? { kind: 'user', id: reporting.userId } : null} subject={reporting?.name ?? ''} visible={!!reporting} onClose={() => setReporting(null)} />
      <MemberModerationDialog slug={slug} userId={moderating} visible={!!moderating} onClose={() => setModerating(null)} />
    </SidePanel>
  );
}

/** Pinned messages, newest pin first, with a way back to each in the feed. */
export function PinsList({ channelId, canUnpin, onJump }: { channelId: string; canUnpin: boolean; onJump?: (m: Message) => void }) {
  const theme = useTheme();
  const c = theme.colors;
  const pins = usePins(channelId, true);
  const actions = useChatActions();
  const [problem, setProblem] = useState<string | null>(null);
  const items = pins.data ?? [];
  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 8 }}>
      {pins.isPending ? <ActivityIndicator /> : null}
      {pins.isError ? <Notice tone="danger">Pinned messages could not be loaded.</Notice> : null}
      {problem ? <Notice tone="danger">{problem}</Notice> : null}
      {pins.isSuccess && items.length === 0 ? (
        <Text variant="bodySm" tone="muted" style={{ padding: 8 }}>
          Nothing is pinned yet. Pin a message from its menu to keep it here.
        </Text>
      ) : null}
      {items.map((m) => (
        <View key={m.id} style={{ gap: 6, padding: 12, borderRadius: theme.radii.md, borderWidth: 1, borderColor: c.hairline, backgroundColor: c.canvas }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Avatar name={m.author?.display_name ?? '?'} uri={m.author?.avatar_url} size={24} />
            <Text variant="bodySmStrong" tone="onDark" numberOfLines={1} style={{ flexShrink: 1 }}>
              {m.author?.display_name ?? 'Deleted account'}
            </Text>
            <Text variant="captionMd" tone="faint">
              {relativeTime(m.created_at)}
            </Text>
          </View>
          <Markdown source={m.content} compact />
          <View style={{ flexDirection: 'row', gap: 16 }}>
            {onJump ? (
              <Text variant="captionMd" tone="onDark" accessibilityRole="button" onPress={() => onJump(m)} style={{ textDecorationLine: 'underline' }}>
                Jump
              </Text>
            ) : null}
            {canUnpin ? (
              <Text
                variant="captionMd"
                tone="muted"
                accessibilityRole="button"
                onPress={() => {
                  setProblem(null);
                  actions?.pin(m, false).catch((e) => setProblem(failureMessage(e, 'Could not unpin. Try again.')));
                }}
                style={{ textDecorationLine: 'underline' }}
              >
                Unpin
              </Text>
            ) : null}
          </View>
        </View>
      ))}
      {items.length > 0 ? (
        <Text variant="captionMd" tone="muted" style={{ paddingHorizontal: 4 }}>
          {items.length} of up to 50 pins
        </Text>
      ) : null}
    </ScrollView>
  );
}

/** The thread a message started, as a narrow chat beside its channel. */
export function ThreadPanel({ threadId, slug, onClose }: { threadId: string; slug?: string; onClose: () => void }) {
  const thread = useChannel(threadId);
  return (
    <SidePanel title="Thread" onClose={onClose} width={380}>
      <ThreadBody thread={thread.data} error={thread.error} slug={slug} wide={false} />
    </SidePanel>
  );
}

/** A thread's chat with the message it started from on top; used by the panel and the phone screen. */
export function ThreadBody({ thread, error, slug, wide }: { thread: Channel | undefined; error: unknown; slug?: string; wide: boolean }) {
  const theme = useTheme();
  const starter = useMessage(thread?.thread_message_id, thread?.parent_id);
  if (!thread) {
    return error ? (
      <View style={{ padding: theme.space.lg }}>
        <Notice tone="danger" title="This thread could not be opened.">
          {failureMessage(error, 'It may have been deleted.')}
        </Notice>
      </View>
    ) : (
      <ActivityIndicator style={{ flex: 1 }} />
    );
  }
  return (
    <ChatView
      key={thread.id}
      channel={thread}
      slug={slug}
      wide={wide}
      placeholder="Reply in thread"
      intro={starter ? undefined : { title: thread.name || 'Thread' }}
      starter={starter ? { ...starter, thread: null as unknown as Message['thread'] } : null}
      onOpenThread={noop}
    />
  );
}

const noop = () => undefined;

/** Title and status line of a conversation: the other person and their presence, or the group. */
export function ConversationHeading({ channel }: { channel: Channel }) {
  const theme = useTheme();
  const myId = useSession()?.userId;
  const other = channel.kind === 'dm' ? channel.recipients?.find((u) => u.id !== myId) : undefined;
  const presence = usePresences(other ? [other.id] : []);
  const status = other ? presence[other.id] : undefined;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm, flexShrink: 1 }}>
      {other ? <PresenceAvatar user={other} size={24} /> : null}
      <Text variant="bodyStrong" tone="onDark" numberOfLines={1} style={{ flexShrink: 1 }}>
        {conversationTitle(channel, myId)}
      </Text>
      {status ? (
        <Text variant="captionMd" tone="muted">
          {presenceLabels[status]}
        </Text>
      ) : channel.kind === 'group_dm' ? (
        <Text variant="captionMd" tone="muted">
          {(channel.recipients ?? []).length} people
        </Text>
      ) : null}
    </View>
  );
}

