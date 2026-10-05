import { buildFeed, firstUnreadId, isAfter, typingText, type FeedItem, type Message, type ParsedCommand } from '@gotalk/core';
import { unwrap } from '@gotalk/api-client';
import { Button, Icon, Notice, Text, useTheme } from '@gotalk/ui';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, View } from 'react-native';

import { ChatComposer } from '@/components/chat-composer';
import { DeleteMessageDialog, MessageHistoryDialog, MessageMenu, MessageSheet, ReactionPickerDialog, StartThreadDialog, messageActions } from '@/components/chat-dialogs';
import { ChatScopeContext, MessageRow, OutgoingRow, type ChatScope } from '@/components/chat-message';
import type { Anchor } from '@/components/menu';
import { useApiClient, useMe } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { useChannelCommands, useChatActions, useMemberNames, useMessages, useOutbox, useReceipts, type Channel, type OutgoingMessage } from '@/lib/chat';
import { failureMessage } from '@/lib/failure';
import { useHoverActions } from '@/lib/layout';
import { useChannelAccess, useChannels } from '@/lib/places';
import { useTypingUsers } from '@/lib/realtime';

type Row =
  | FeedItem
  | { kind: 'intro'; key: string }
  | { kind: 'starter'; key: string; message: Message }
  | { kind: 'outgoing'; key: string; item: OutgoingMessage; continued: boolean };

/** True while this screen is focused and the app is in front, so reading it can count as read. */
function useAttentive(): boolean {
  const [screen, setScreen] = useState(true);
  const [app, setApp] = useState(() => (Platform.OS === 'web' ? typeof document === 'undefined' || document.visibilityState !== 'hidden' : AppState.currentState === 'active'));
  useFocusEffect(
    useCallback(() => {
      setScreen(true);
      return () => setScreen(false);
    }, []),
  );
  useEffect(() => {
    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') return;
      const on = () => setApp(document.visibilityState !== 'hidden');
      document.addEventListener('visibilitychange', on);
      return () => document.removeEventListener('visibilitychange', on);
    }
    const sub = AppState.addEventListener('change', (s) => setApp(s === 'active'));
    return () => sub.remove();
  }, []);
  return screen && app;
}

function DayDivider({ label, wide }: { label: string; wide: boolean }) {
  const theme = useTheme();
  const line = <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.hairline }} />;
  return (
    <View accessibilityRole="header" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: wide ? 20 : 16, paddingVertical: 8 }}>
      {line}
      <Text variant="captionMd" tone="muted">
        {label}
      </Text>
      {line}
    </View>
  );
}

/** The one high-contrast element in the feed: where unread messages start. */
function NewMarker({ wide }: { wide: boolean }) {
  const theme = useTheme();
  const c = theme.colors;
  const line = <View style={{ flex: 1, height: 1, backgroundColor: c.hairlineStrong }} />;
  return (
    <View accessibilityLabel="New messages start here" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: wide ? 20 : 16, paddingVertical: 8 }}>
      {line}
      <View style={{ height: 20, paddingHorizontal: 8, justifyContent: 'center', borderRadius: theme.radii.xs, backgroundColor: c.primary }}>
        <Text variant="captionSm" tone="inverse" style={{ fontFamily: theme.fontFaces['500'] }}>
          New
        </Text>
      </View>
      {line}
    </View>
  );
}

export interface ChatViewProps {
  channel: Channel;
  /** The place, for `@mention` suggestions and command lookups. */
  slug?: string;
  /** Roomy layout. Narrow panels pass false even on wide screens. */
  wide: boolean;
  placeholder: string;
  /** Shown at the top once the whole history is loaded. */
  intro?: { title: string; body?: string };
  /** Threads: the message the thread started from, kept above the replies. */
  starter?: Message | null;
  onOpenThread: (m: Message) => void;
  /** Called after a thread was created from a message. */
  onThreadStarted?: (thread: Channel, from: Message) => void;
  /** Scrolls to a message (for example from the pins panel); `seq` repeats a jump to the same one. */
  jump?: { id: string; seq: number } | null;
}

/** A channel, thread or conversation: virtualized history that loads older pages upward, typing, and the composer. */
export function ChatView({ channel, slug, wide, placeholder, intro, starter, onOpenThread, onThreadStarted, jump }: ChatViewProps) {
  const theme = useTheme();
  const c = theme.colors;
  const hover = useHoverActions();
  const session = useSession();
  const myId = session?.userId;
  const me = useMe().data;
  const client = useApiClient();
  const actions = useChatActions();
  const access = useChannelAccess(channel);
  const direct = channel.kind === 'dm' || channel.kind === 'group_dm';
  const can = useMemo(
    () => ({
      send: access.can('SEND_MESSAGES'),
      react: access.can('ADD_REACTIONS'),
      manage: !direct && access.can('MANAGE_MESSAGES'),
      pin: direct || access.can('MANAGE_MESSAGES'),
      thread: channel.kind === 'text' && access.can('SEND_MESSAGES'),
    }),
    [access, direct, channel.kind],
  );

  const query = useMessages(channel.id);
  const outbox = useOutbox(channel.id);
  const receipts = useReceipts(channel.id, channel.kind === 'dm').data;
  const commands = useChannelCommands(channel.id, !!channel.place_id && can.send).data ?? [];
  const placeChannels = useChannels(slug, !!slug).data;
  const typingIds = useTypingUsers(channel.id);
  const attentive = useAttentive();
  const list = useRef<FlashListRef<Row>>(null);
  const atBottom = useRef(true);

  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingId, setEditing] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ message: Message; anchor?: Anchor } | null>(null);
  const [picker, setPicker] = useState<Message | null>(null);
  const [history, setHistory] = useState<Message | null>(null);
  const [deleting, setDeleting] = useState<Message | null>(null);
  const [threading, setThreading] = useState<Message | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState(0);

  // The New marker sits where the read position was when the channel opened, and stays there while reading.
  const [marker, setMarker] = useState<{ channelId: string; before: string | null } | null>(null);
  if (query.isSuccess && marker?.channelId !== channel.id) {
    setMarker({ channelId: channel.id, before: firstUnreadId(query.messages, channel.read_state?.last_read_message_id ?? undefined, myId) });
  }
  const markerBefore = marker?.channelId === channel.id ? marker.before : null;
  const feed = useMemo(() => buildFeed(query.messages, { newMarkerBefore: markerBefore }), [query.messages, markerBefore]);

  // "Seen" goes under my latest message the other person has read.
  const seenId = useMemo(() => {
    if (channel.kind !== 'dm' || !receipts) return null;
    const other = receipts.find((r) => r.user_id !== myId)?.last_read_message_id;
    if (!other) return null;
    const mine = [...query.messages].reverse().find((m) => m.author?.id === myId);
    return mine && !isAfter(mine.id, other) ? mine.id : null;
  }, [channel.kind, receipts, query.messages, myId]);

  const rows = useMemo(() => {
    const out: Row[] = [];
    if (intro && query.isSuccess && !query.hasNextPage) out.push({ kind: 'intro', key: 'intro' });
    if (starter) out.push({ kind: 'starter', key: 'starter', message: starter });
    out.push(...feed);
    const last = query.messages.at(-1);
    let continued = !!last && last.author?.id === myId;
    let at = last ? Date.parse(last.created_at) : 0;
    for (const item of outbox) {
      const sent = Date.parse(item.createdAt);
      out.push({ kind: 'outgoing', key: item.nonce, item, continued: continued && !item.replyTo && sent - at < 7 * 60_000 });
      continued = true;
      at = sent;
    }
    return out;
  }, [intro, query.isSuccess, query.hasNextPage, query.messages, starter, feed, outbox, myId]);

  // Own messages appear, and failed ones grow a line, at the very end: keep them in view if the reader was there.
  useEffect(() => {
    if (!atBottom.current || outbox.length === 0) return;
    const t = setTimeout(() => void list.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [outbox]);

  // Reading the newest message while the screen has attention moves the read position.
  const newest = query.messages.at(-1);
  const marked = useRef<string | null>(null);
  useEffect(() => {
    const read = channel.read_state;
    if (!actions || !newest || !attentive || !read) return;
    if (!isAfter(newest.id, read.last_read_message_id) && read.mention_count === 0) return;
    if (marked.current === newest.id) return;
    const t = setTimeout(() => {
      marked.current = newest.id;
      actions.markRead(channel.id, newest.id).catch(() => {
        marked.current = null;
      });
    }, 500);
    return () => clearTimeout(t);
  }, [actions, channel.id, channel.read_state, newest, attentive]);

  const knownName = useCallback(
    (id: string) => channel.recipients?.find((u) => u.id === id)?.display_name ?? [...query.messages].reverse().find((m) => m.author?.id === id)?.author?.display_name,
    [channel.recipients, query.messages],
  );
  const memberNames = useMemberNames(channel.place_id, typingIds.filter((id) => !knownName(id)));
  const nameOf = (id: string) => knownName(id) ?? memberNames[id] ?? 'Someone';

  const isLoaded = useCallback((id: string) => query.messages.some((m) => m.id === id), [query.messages]);
  const jumpTo = useCallback(
    (id: string) => {
      if (isLoaded(id)) setHighlight(id);
      else setProblem('That message is further back. Scroll up to load older messages.');
    },
    [isLoaded],
  );

  // A jump requested from outside (the pins panel or screen) is handled once, when the history is there.
  const [handledJump, setHandledJump] = useState<typeof jump>(null);
  if (jump && jump !== handledJump && query.isSuccess) {
    setHandledJump(jump);
    if (isLoaded(jump.id)) setHighlight(jump.id);
    else setProblem('That message is further back. Scroll up to load older messages.');
  }

  // Bring the highlighted message into view, then let the highlight fade.
  useEffect(() => {
    if (!highlight) return;
    const index = rows.findIndex((r) => r.kind === 'message' && r.message.id === highlight);
    if (index >= 0) void list.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    const t = setTimeout(() => setHighlight(null), 2_000);
    return () => clearTimeout(t);
    // Scrolling again whenever the list changes would fight the reader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight]);

  const run = useCallback(async (work: () => Promise<unknown>, fallback: string) => {
    setProblem(null);
    try {
      await work();
    } catch (e) {
      setProblem(failureMessage(e, fallback));
    }
  }, []);

  const scope: ChatScope = useMemo(
    () => ({
      channel,
      wide,
      hover,
      myId,
      can,
      editingId,
      setEditing,
      async saveEdit(m, content) {
        try {
          await actions?.edit(m, content);
          setEditing(null);
          return true;
        } catch {
          return false;
        }
      },
      reply(m) {
        setReplyTo(m);
        setFocusKey((k) => k + 1);
      },
      openThread: onOpenThread,
      startThread: setThreading,
      react: (m, emoji, on) => void run(() => actions!.react(m, emoji, on), 'Could not react. Try again.'),
      openActions: (m, anchor) => setMenu({ message: m, anchor }),
      openPicker: setPicker,
      showHistory: setHistory,
      jumpTo,
      retry: (nonce) => actions?.retry(nonce),
      discard: (nonce) => actions?.discard(nonce),
    }),
    [channel, wide, hover, myId, can, editingId, actions, onOpenThread, jumpTo, run],
  );

  const menuActions = menu
    ? messageActions(menu.message, { myId, can, reply: scope.reply, openThread: onOpenThread, startThread: setThreading, setEditing, showHistory: setHistory }, {
        pin: (m, on) => void run(() => actions!.pin(m, on), 'Could not change the pin. Try again.'),
        remove: setDeleting,
      })
    : [];

  async function runCommand(parsed: ParsedCommand) {
    if (!actions || !client) return;
    await actions.invoke(channel.id, parsed, async (kind, name) => {
      if (kind === 'channel') return placeChannels?.find((ch) => ch.name === name)?.id ?? null;
      const res = await client.GET('/users/{username}', { params: { path: { username: name } } });
      return res.response.ok ? unwrap(res).id : null;
    });
  }

  const author = { display_name: me?.display_name ?? session?.displayName ?? 'You', avatar_url: me?.avatar_url ?? session?.avatarUrl ?? null };

  const renderRow = ({ item }: { item: Row }) => {
    switch (item.kind) {
      case 'intro':
        if (!intro) return null;
        return (
          <View style={{ paddingHorizontal: wide ? 20 : 16, paddingTop: 24, paddingBottom: 8, gap: 4 }}>
            <Text variant={wide ? 'headingLg' : 'headingMd'} accessibilityRole="header">
              {intro.title}
            </Text>
            {intro.body ? (
              <Text variant="bodySm" tone="muted">
                {intro.body}
              </Text>
            ) : null}
          </View>
        );
      case 'starter':
        return (
          <View style={{ paddingTop: 8 }}>
            <MessageRow message={item.message} continued={false} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: wide ? 20 : 16, paddingTop: 8 }}>
              <Text variant="captionMd" tone="muted">
                {query.messages.length} {query.messages.length === 1 ? 'reply' : 'replies'}
              </Text>
              <View style={{ flex: 1, height: 1, backgroundColor: c.hairline }} />
            </View>
          </View>
        );
      case 'day':
        return <DayDivider label={item.label} wide={wide} />;
      case 'new':
        return <NewMarker wide={wide} />;
      case 'message':
        return <MessageRow message={item.message} continued={item.continued} highlighted={highlight === item.message.id} seen={seenId === item.message.id} />;
      case 'outgoing':
        return <OutgoingRow item={item.item} author={author} continued={item.continued} />;
    }
  };

  const names = typingIds.map(nameOf);

  return (
    <ChatScopeContext.Provider value={scope}>
      <View style={{ flex: 1, minHeight: 0 }}>
        {query.isPending ? (
          <ActivityIndicator style={{ flex: 1 }} />
        ) : query.isError ? (
          <View style={{ flex: 1, justifyContent: 'center', padding: theme.space.lg, gap: theme.space.md }}>
            <Notice tone="danger" title="Messages could not be loaded.">
              {failureMessage(query.error, 'Check your connection and try again.')}
            </Notice>
            <Button title="Try again" variant="tertiary" onPress={() => void query.refetch()} />
          </View>
        ) : (
          <FlashList
            ref={list}
            data={rows}
            keyExtractor={(r) => r.key}
            getItemType={(r) => r.kind}
            renderItem={renderRow}
            extraData={[scope, highlight, seenId, author.display_name]}
            maintainVisibleContentPosition={{ startRenderingFromBottom: true, autoscrollToBottomThreshold: 0.2 }}
            onStartReached={() => {
              if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
            }}
            onStartReachedThreshold={0.5}
            onScroll={(e) => {
              const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
              atBottom.current = contentSize.height - (contentOffset.y + layoutMeasurement.height) < 120;
            }}
            scrollEventThrottle={100}
            ListHeaderComponent={query.isFetchingNextPage ? <ActivityIndicator style={{ margin: 12 }} /> : null}
            ListFooterComponent={<View style={{ height: 8 }} />}
            keyboardShouldPersistTaps="handled"
          />
        )}
        {problem ? (
          <View style={{ paddingHorizontal: wide ? 20 : 12, paddingBottom: 6 }}>
            <Text variant="captionMd" tone="danger" accessibilityLiveRegion="polite" onPress={() => setProblem(null)}>
              {problem}
            </Text>
          </View>
        ) : null}
        <View accessibilityLiveRegion="polite" style={{ height: 20, paddingHorizontal: wide ? 20 : 16, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {names.length > 0 ? (
            <>
              <View style={{ flexDirection: 'row', gap: 3 }}>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: c.mute }} />
                ))}
              </View>
              <Text variant="captionMd" tone="muted" numberOfLines={1}>
                {typingText(names)}
              </Text>
            </>
          ) : null}
        </View>
        {can.send ? (
          <ChatComposer
            channel={channel}
            slug={slug}
            placeholder={placeholder}
            wide={wide}
            replyTo={replyTo}
            onClearReply={() => setReplyTo(null)}
            focusKey={focusKey || undefined}
            commands={commands}
            onCommand={runCommand}
            onTyping={() => void actions?.typing(channel.id)}
            onSend={(content) => {
              atBottom.current = true;
              actions?.send(channel.id, content, replyTo);
              setReplyTo(null);
            }}
          />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: wide ? 20 : 12, marginBottom: wide ? 16 : 8, padding: 12, borderRadius: theme.radii.md, borderWidth: 1, borderColor: c.hairline }}>
            <Icon name="lock" size={16} color={c.mute} />
            <Text variant="bodySm" tone="muted">
              You cannot send messages here.
            </Text>
          </View>
        )}
      </View>

      {hover ? (
        <MessageMenu actions={menuActions} anchor={menu?.anchor ?? { right: 24, top: 120 }} visible={!!menu} onClose={() => setMenu(null)} />
      ) : (
        <MessageSheet
          message={menu?.message ?? null}
          actions={menuActions}
          canReact={can.react}
          visible={!!menu}
          onClose={() => setMenu(null)}
          onReact={(emoji) => {
            const m = menu?.message;
            if (m) scope.react(m, emoji, !(m.reactions ?? []).some((r) => r.emoji === emoji && r.me));
          }}
          onMoreReactions={() => menu && setPicker(menu.message)}
        />
      )}
      <ReactionPickerDialog
        visible={!!picker}
        onClose={() => setPicker(null)}
        onPick={(emoji) => {
          if (!picker) return;
          const on = !(picker.reactions ?? []).some((r) => r.emoji === emoji && r.me);
          scope.react(picker, emoji, on);
        }}
      />
      <MessageHistoryDialog message={history} onClose={() => setHistory(null)} />
      <DeleteMessageDialog message={deleting} mine={!!deleting && deleting.author?.id === myId} onClose={() => setDeleting(null)} onDelete={(m, reason) => actions!.remove(m, reason)} />
      <StartThreadDialog
        message={threading}
        onClose={() => setThreading(null)}
        onStart={async (m, name) => {
          const thread = await actions!.startThread(m, name);
          onThreadStarted?.(thread, m);
        }}
      />
    </ChatScopeContext.Provider>
  );
}
