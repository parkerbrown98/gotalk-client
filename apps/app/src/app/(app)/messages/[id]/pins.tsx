import { router, useLocalSearchParams } from 'expo-router';

import { PinsList } from '@/components/chat-panels';
import { ChatFrame } from '@/components/chat-screen';
import { goBack, useWide } from '@/lib/layout';

/** Phones: a conversation's pinned messages. Everyone in a conversation may pin and unpin. */
export default function ConversationPins() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const wide = useWide();
  return (
    <ChatFrame wide={wide} title="Pinned messages" onBack={() => goBack({ pathname: '/messages/[id]', params: { id } })}>
      <PinsList channelId={id} canUnpin onJump={(m) => router.navigate({ pathname: '/messages/[id]', params: { id, jump: m.id } })} />
    </ChatFrame>
  );
}
