import { conversationTitle } from '@gotalk/core';
import { Button, Icon, Text, TextField, useTheme } from '@gotalk/ui';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConversationListRow, NewConversationDialog } from '@/components/conversations';
import { Empty } from '@/components/forum';
import { TitleBar } from '@/components/screen-frame';
import { useSession } from '@/lib/auth';
import { useConversations } from '@/lib/chat';
import { useWide } from '@/lib/layout';

/** Phones: every direct and group conversation. Wide screens list them in the sidebar, so this is the empty state. */
export default function Messages() {
  const theme = useTheme();
  const wide = useWide();
  const insets = useSafeAreaInsets();
  const myId = useSession()?.userId;
  const conversations = useConversations();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const list = useMemo(() => {
    const all = conversations.data ?? [];
    const needle = q.trim().toLowerCase();
    return needle ? all.filter((c) => conversationTitle(c, myId).toLowerCase().includes(needle) || (c.recipients ?? []).some((u) => u.username.toLowerCase().includes(needle))) : all;
  }, [conversations.data, q, myId]);

  const dialog = <NewConversationDialog visible={creating} onClose={() => setCreating(false)} />;

  if (wide) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.space.md, padding: theme.space.xl }}>
        <Icon name="forum" size={32} color={theme.colors.mute} />
        <Text variant="headingMd" accessibilityRole="header">
          Direct messages
        </Text>
        <Text variant="bodySm" tone="muted" style={{ textAlign: 'center', maxWidth: 360 }}>
          Pick a conversation on the left, or start one with someone you share a place with.
        </Text>
        <Button title="New message" onPress={() => setCreating(true)} />
        {dialog}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas, paddingTop: insets.top }}>
      <TitleBar
        title="Messages"
        end={
          <Pressable accessibilityRole="button" accessibilityLabel="New message" onPress={() => setCreating(true)} hitSlop={12}>
            <Icon name="plus" size={20} color={theme.colors.onDark} />
          </Pressable>
        }
      />
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={{ paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md }}>
          <TextField accessibilityLabel="Find a conversation" placeholder="Find a conversation" value={q} onChangeText={setQ} />
        </View>
        {conversations.isPending ? <ActivityIndicator style={{ marginTop: 24 }} /> : null}
        {list.map((c) => (
          <ConversationListRow key={c.id} channel={c} />
        ))}
        {conversations.isSuccess && list.length === 0 ? <Empty>{q ? 'No conversation matches.' : 'No conversations yet. Start one with someone you share a place with.'}</Empty> : null}
      </ScrollView>
      {dialog}
    </View>
  );
}
