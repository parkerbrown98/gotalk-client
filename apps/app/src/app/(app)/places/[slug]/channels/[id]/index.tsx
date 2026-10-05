import { previewText, type Message } from '@gotalk/core';
import { Icon, Notice, Stack, Text, useTheme } from '@gotalk/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { MembersPanel, PinsList, SidePanel, ThreadPanel } from '@/components/chat-panels';
import { BarButton, ChatFrame, TopBar } from '@/components/chat-screen';
import { ChatView } from '@/components/chat-view';
import { ScreenFrame } from '@/components/screen-frame';
import { useChannel, usePins, type Channel } from '@/lib/chat';
import { failureMessage } from '@/lib/failure';
import { goBack, useWide } from '@/lib/layout';
import { useChannelAccess, useChannels } from '@/lib/places';

type Panel = 'members' | 'pins' | null;

/** The latest pin under the top bar, as in the mockup; it opens the pins panel. */
function PinnedStrip({ channelId, onOpen }: { channelId: string; onOpen: () => void }) {
  const theme = useTheme();
  const c = theme.colors;
  const pins = usePins(channelId, true).data ?? [];
  if (pins.length === 0) return null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${pins.length} pinned. Show pinned messages`} onPress={onOpen} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.hairline }}>
      <Icon name="pin" size={16} color={c.mute} />
      <Text variant="captionMd" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
        {previewText(pins[0]!.content, 160)}
      </Text>
      <Text variant="captionMd" tone="muted" style={{ textDecorationLine: 'underline' }}>
        {pins.length} pinned
      </Text>
    </Pressable>
  );
}

function VoicePlaceholder({ channel, slug }: { channel: Channel; slug: string }) {
  return (
    <ScreenFrame title={channel.name} onBack={() => goBack({ pathname: '/places/[slug]', params: { slug } })}>
      <Stack gap="lg">
        <Text variant="headingXl" accessibilityRole="header">
          {channel.name}
        </Text>
        <Notice tone="info" title="Voice is coming soon.">
          You will join calls from here once voice opens in this client.
        </Notice>
      </Stack>
    </ScreenFrame>
  );
}

/** A text channel: the feed with members, pins or a thread beside it on wide screens. */
export default function ChannelScreen() {
  const { slug, id, thread, jump } = useLocalSearchParams<{ slug: string; id: string; thread?: string; jump?: string }>();
  const wide = useWide();
  const theme = useTheme();
  const listed = useChannels(slug).data?.find((c) => c.id === id);
  const query = useChannel(id);
  const channel = query.data ?? listed;
  const access = useChannelAccess(channel);
  const [panel, setPanel] = useState<Panel>('members');
  const [jumpTo, setJumpTo] = useState<{ id: string; seq: number } | null>(null);

  // Pins on phones are their own screen; "Jump" comes back here with the message id.
  const jumpParam = useMemo(() => (jump ? { id: jump, seq: 0 } : null), [jump]);

  const openThread = useCallback(
    (threadId: string) => {
      if (wide) router.setParams({ thread: threadId });
      else router.push({ pathname: '/places/[slug]/channels/[id]/threads/[thread]', params: { slug, id, thread: threadId } });
    },
    [wide, slug, id],
  );
  const onOpenThread = useCallback((m: Message) => m.thread && openThread(m.thread.id), [openThread]);
  const back = () => goBack({ pathname: '/places/[slug]', params: { slug } });

  if (!channel) {
    if (query.isPending) return <ActivityIndicator style={{ flex: 1 }} />;
    return (
      <ScreenFrame title="Channel" onBack={back}>
        <Notice tone="danger" title="This channel could not be opened.">
          {failureMessage(query.error, 'It may have been deleted, or you no longer have access.')}
        </Notice>
      </ScreenFrame>
    );
  }
  if (channel.kind === 'voice') return <VoicePlaceholder channel={channel} slug={slug} />;

  const togglePanel = (p: Exclude<Panel, null>) => {
    if (thread) router.setParams({ thread: undefined });
    setPanel((current) => (current === p && !thread ? null : p));
  };

  const side = thread ? (
    <ThreadPanel threadId={thread} slug={slug} onClose={() => router.setParams({ thread: undefined })} />
  ) : panel === 'members' ? (
    <MembersPanel slug={slug} />
  ) : panel === 'pins' ? (
    <SidePanel title="Pinned messages" onClose={() => setPanel(null)} width={380}>
      <PinsList channelId={channel.id} canUnpin={access.can('MANAGE_MESSAGES')} onJump={(m) => setJumpTo({ id: m.id, seq: Date.now() })} />
    </SidePanel>
  ) : null;

  return (
    <ChatFrame
      wide={wide}
      title={channel.name}
      onBack={back}
      end={<BarButton icon="pin" label="Pinned messages" size={20} onPress={() => router.push({ pathname: '/places/[slug]/channels/[id]/pins', params: { slug, id } })} />}
      topBar={
        <>
          <TopBar
            end={
              <>
                <BarButton icon="pin" label="Pinned messages" active={panel === 'pins' && !thread} onPress={() => togglePanel('pins')} />
                <BarButton icon="users" label="Members" active={panel === 'members' && !thread} onPress={() => togglePanel('members')} />
              </>
            }
          >
            <Icon name="hash" size={16} color={theme.colors.mute} />
            <Text variant="bodyStrong" tone="onDark" accessibilityRole="header" numberOfLines={1}>
              {channel.name}
            </Text>
            {channel.topic ? (
              <Text variant="captionMd" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                {channel.topic}
              </Text>
            ) : null}
          </TopBar>
          {panel === 'pins' && !thread ? null : <PinnedStrip channelId={channel.id} onOpen={() => togglePanel('pins')} />}
        </>
      }
      side={side}
    >
      <View style={{ flex: 1 }}>
        <ChatView
          key={channel.id}
          channel={channel}
          slug={slug}
          wide={wide}
          placeholder={`Message #${channel.name}`}
          intro={{ title: `This is the start of #${channel.name}.`, body: channel.topic || undefined }}
          onOpenThread={onOpenThread}
          onThreadStarted={(t) => openThread(t.id)}
          jump={jumpTo ?? jumpParam}
        />
      </View>
    </ChatFrame>
  );
}
