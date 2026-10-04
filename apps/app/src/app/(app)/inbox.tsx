import { describeNotification, shortTime } from '@gotalk/core';
import { Avatar, Button, Icon, ListCard, Notice, PillTabs, Text, useTheme } from '@gotalk/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Empty, messageFor } from '@/components/forum';
import { ScreenFrame } from '@/components/screen-frame';
import { useForumActions, useNotifications, type Notification } from '@/lib/forums';
import { useWide } from '@/lib/layout';

function Row({ n, onOpen, onDismiss }: { n: Notification; onOpen: () => void; onDismiss: () => void }) {
  const theme = useTheme();
  const c = theme.colors;
  const v = describeNotification(n);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${n.read ? '' : 'Unread. '}${v.actor} ${v.action}`}
        onPress={onOpen}
        style={({ pressed }) => ({ flex: 1, flexDirection: 'row', gap: theme.space.md, padding: theme.space.lg, backgroundColor: pressed ? c.surfaceElevated : 'transparent' })}
      >
        <View style={{ width: 8, height: 8, marginTop: 8, borderRadius: 4, backgroundColor: n.read ? 'transparent' : c.primary }} />
        {n.actor ? <Avatar name={n.actor.display_name} uri={n.actor.avatar_url} size={32} /> : (
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.surfaceCard, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={v.icon} size={16} color={c.body} />
          </View>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodySm" tone={n.read ? 'default' : 'onDark'}>
            {v.actor ? (
              <Text variant="bodySm" tone="onDark" style={{ fontFamily: theme.fontFaces['500'] }}>
                {v.actor}{' '}
              </Text>
            ) : null}
            {v.action}
          </Text>
          {v.detail ? (
            <Text variant="captionMd" numberOfLines={2}>
              {v.detail}
            </Text>
          ) : null}
          {v.context ? (
            <Text variant="captionMd" tone="muted" numberOfLines={1}>
              {v.context}
            </Text>
          ) : null}
        </View>
        <Text variant="captionMd" tone="muted">
          {shortTime(n.created_at)}
        </Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss notification" hitSlop={8} onPress={onDismiss} style={{ padding: theme.space.lg, paddingLeft: 0 }}>
        <Icon name="x" size={14} color={c.mute} />
      </Pressable>
    </View>
  );
}

/** Replies, mentions, accepted answers and the rest, newest first. */
export default function Inbox() {
  const theme = useTheme();
  const wide = useWide();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const query = useNotifications(filter === 'unread');
  const actions = useForumActions();
  const [problem, setProblem] = useState<string | null>(null);
  const run = async (work: () => Promise<unknown>) => {
    setProblem(null);
    try {
      await work();
    } catch (e) {
      setProblem(messageFor(e, 'That did not work. Try again.'));
    }
  };
  const hasUnread = query.items.some((n) => !n.read);

  const open = (n: Notification) => {
    const target = describeNotification(n).target;
    if (!n.read) void run(() => actions.markNotificationRead(n.id));
    if (!target) return;
    if (target.topicId) router.push({ pathname: '/places/[slug]/topics/[id]', params: { slug: target.placeSlug, id: target.topicId } });
    else router.push({ pathname: '/places/[slug]', params: { slug: target.placeSlug } });
  };

  return (
    <ScreenFrame title="Inbox" end={wide ? undefined : <Pressable accessibilityRole="button" disabled={!hasUnread} hitSlop={12} onPress={() => void run(() => actions.markAllNotificationsRead())}><Text variant="bodySm" tone={hasUnread ? 'onDark' : 'faint'}>Read all</Text></Pressable>} maxWidth={820} contentStyle={wide ? { paddingVertical: 32, paddingHorizontal: 40 } : { paddingVertical: theme.space.sm, paddingHorizontal: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: wide ? 0 : theme.space.lg, paddingVertical: theme.space.md, gap: theme.space.md }}>
        {wide ? (
          <Text variant="headingLg" accessibilityRole="header">
            Inbox
          </Text>
        ) : null}
        <PillTabs
          options={[
            { value: 'all', label: 'All' },
            { value: 'unread', label: 'Unread' },
          ]}
          value={filter}
          onChange={setFilter}
        />
        {wide ? <Button title="Mark all read" variant="tertiary" disabled={!hasUnread} onPress={() => void run(() => actions.markAllNotificationsRead())} /> : null}
      </View>
      {problem ? (
        <View style={{ paddingHorizontal: wide ? 0 : theme.space.lg, paddingBottom: theme.space.md }}>
          <Notice tone="danger">{problem}</Notice>
        </View>
      ) : null}
      {query.isPending ? <ActivityIndicator style={{ marginTop: 32 }} /> : null}
      {query.isError ? (
        <View style={{ gap: theme.space.md, paddingHorizontal: wide ? 0 : theme.space.lg }}>
          <Notice tone="danger" title="The inbox could not be loaded.">
            Check your connection and try again.
          </Notice>
          <Button title="Try again" variant="tertiary" onPress={() => void query.refetch()} />
        </View>
      ) : null}
      {query.isSuccess && query.items.length === 0 ? <Empty>{filter === 'unread' ? 'You are all caught up.' : 'Nothing yet. Replies, mentions and accepted answers show up here.'}</Empty> : null}
      {query.items.length > 0 ? (
        <ListCard style={wide ? undefined : { borderWidth: 0, borderRadius: 0 }}>
          {query.items.map((n) => (
            <Row key={n.id} n={n} onOpen={() => open(n)} onDismiss={() => void run(() => actions.dismissNotification(n.id))} />
          ))}
        </ListCard>
      ) : null}
      {query.hasNextPage ? (
        <View style={{ padding: theme.space.lg, alignItems: 'center' }}>
          <Button title="Load older" variant="tertiary" loading={query.isFetchingNextPage} onPress={() => void query.fetchNextPage()} />
        </View>
      ) : null}
    </ScreenFrame>
  );
}
