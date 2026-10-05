import { conversationTitle } from '@gotalk/core';
import { Button, Dialog, Notice, Text, useTheme } from '@gotalk/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { RenameConversationDialog } from '@/components/channel-menu';
import { ConversationHeading, PinsList, SidePanel } from '@/components/chat-panels';
import { BarButton, ChatFrame, TopBar } from '@/components/chat-screen';
import { ChatView } from '@/components/chat-view';
import { NewConversationDialog } from '@/components/conversations';
import { ActionList } from '@/components/forum';
import { ScreenFrame } from '@/components/screen-frame';
import { useSession } from '@/lib/auth';
import { useChannel, useChatActions, useConversations } from '@/lib/chat';
import { failureMessage } from '@/lib/failure';
import { goBack, useWide } from '@/lib/layout';

/** A direct or group conversation. Groups can add people and be left. */
export default function Conversation() {
  const { id, jump } = useLocalSearchParams<{ id: string; jump?: string }>();
  const theme = useTheme();
  const wide = useWide();
  const myId = useSession()?.userId;
  const listed = useConversations().data?.find((c) => c.id === id);
  const query = useChannel(id);
  const channel = query.data ?? listed;
  const actions = useChatActions();
  const [pins, setPins] = useState(false);
  const [menu, setMenu] = useState(false);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [jumpTo, setJumpTo] = useState<{ id: string; seq: number } | null>(null);
  const noThreads = useCallback(() => undefined, []);

  const jumpParam = useMemo(() => (jump ? { id: jump, seq: 0 } : null), [jump]);

  const back = () => goBack('/messages');
  if (!channel) {
    if (query.isPending) return <ActivityIndicator style={{ flex: 1 }} />;
    return (
      <ScreenFrame title="Conversation" onBack={back}>
        <Notice tone="danger" title="This conversation could not be opened.">
          {failureMessage(query.error, 'You may have left it.')}
        </Notice>
      </ScreenFrame>
    );
  }

  const title = conversationTitle(channel, myId);
  const group = channel.kind === 'group_dm';
  const other = channel.kind === 'dm' ? channel.recipients?.find((u) => u.id !== myId) : undefined;
  const menuItems = group
    ? [
        { key: 'rename', label: 'Rename conversation', icon: 'edit' as const, onPress: () => setRenaming(true) },
        { key: 'add', label: 'Add people', icon: 'users' as const, onPress: () => setAdding(true) },
        { key: 'leave', label: 'Leave conversation', icon: 'logout' as const, danger: true, onPress: () => setLeaving(true) },
      ]
    : [];

  return (
    <ChatFrame
      wide={wide}
      title={title}
      onBack={back}
      end={
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <BarButton icon="pin" label="Pinned messages" size={20} onPress={() => router.push({ pathname: '/messages/[id]/pins', params: { id } })} />
          {group ? <BarButton icon="more" label="Conversation actions" size={20} onPress={() => setMenu(true)} /> : null}
        </View>
      }
      topBar={
        <TopBar
          end={
            <>
              <BarButton icon="pin" label="Pinned messages" active={pins} onPress={() => setPins((p) => !p)} />
              {group ? <BarButton icon="more" label="Conversation actions" onPress={() => setMenu(true)} /> : null}
            </>
          }
        >
          <ConversationHeading channel={channel} />
        </TopBar>
      }
      side={
        pins ? (
          <SidePanel title="Pinned messages" onClose={() => setPins(false)} width={380}>
            <PinsList channelId={channel.id} canUnpin onJump={(m) => setJumpTo({ id: m.id, seq: Date.now() })} />
          </SidePanel>
        ) : null
      }
    >
      {problem ? (
        <View style={{ padding: theme.space.md }}>
          <Notice tone="danger">{problem}</Notice>
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <ChatView
          key={channel.id}
          channel={channel}
          wide={wide}
          placeholder={`Message ${title}`}
          intro={{ title: other ? `This is the start of your conversation with ${other.display_name}.` : `This is the start of ${title}.`, body: group ? (channel.recipients ?? []).map((u) => u.display_name).join(', ') : undefined }}
          onOpenThread={noThreads}
          jump={jumpTo ?? jumpParam}
        />
      </View>
      <ActionList items={menuItems} visible={menu} onClose={() => setMenu(false)} />
      <NewConversationDialog visible={adding} onClose={() => setAdding(false)} addTo={channel} />
      <RenameConversationDialog channel={channel} visible={renaming} onClose={() => setRenaming(false)} />
      <Dialog visible={leaving} onClose={() => setLeaving(false)}>
        <Text variant="headingMd" accessibilityRole="header">
          Leave {title}?
        </Text>
        <Text variant="bodySm" tone="muted">
          You stop receiving its messages. Someone in it has to add you again to come back.
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: theme.space.sm }}>
          <Button title="Stay" variant="tertiary" onPress={() => setLeaving(false)} />
          <Button
            title="Leave conversation"
            variant="danger"
            onPress={async () => {
              setLeaving(false);
              setProblem(null);
              try {
                await actions?.leaveConversation(channel.id);
                router.replace('/messages');
              } catch (e) {
                setProblem(failureMessage(e, 'Could not leave the conversation. Try again.'));
              }
            }}
          />
        </View>
      </Dialog>
    </ChatFrame>
  );
}
