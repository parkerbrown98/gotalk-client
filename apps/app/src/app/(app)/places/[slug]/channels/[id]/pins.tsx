import { router, useLocalSearchParams } from 'expo-router';

import { PinsList } from '@/components/chat-panels';
import { ChatFrame } from '@/components/chat-screen';
import { useChannel } from '@/lib/chat';
import { goBack, useWide } from '@/lib/layout';
import { useChannelAccess } from '@/lib/places';

/** Phones: a channel's pinned messages. Wide screens show them in the channel's side panel. */
export default function ChannelPins() {
  const { slug, id } = useLocalSearchParams<{ slug: string; id: string }>();
  const wide = useWide();
  const channel = useChannel(id).data;
  const access = useChannelAccess(channel);
  return (
    <ChatFrame wide={wide} title="Pinned messages" onBack={() => goBack({ pathname: '/places/[slug]/channels/[id]', params: { slug, id } })}>
      <PinsList channelId={id} canUnpin={access.can('MANAGE_MESSAGES')} onJump={(m) => router.navigate({ pathname: '/places/[slug]/channels/[id]', params: { slug, id, jump: m.id } })} />
    </ChatFrame>
  );
}
