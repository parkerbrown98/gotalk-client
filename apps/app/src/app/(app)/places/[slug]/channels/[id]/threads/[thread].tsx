import { Redirect, useLocalSearchParams } from 'expo-router';

import { ThreadBody } from '@/components/chat-panels';
import { ChatFrame } from '@/components/chat-screen';
import { useChannel } from '@/lib/chat';
import { goBack, useWide } from '@/lib/layout';

/** Phones: a thread as a full screen, with the message it started from on top. Wide screens open it beside the channel. */
export default function ThreadScreen() {
  const { slug, id, thread } = useLocalSearchParams<{ slug: string; id: string; thread: string }>();
  const wide = useWide();
  const query = useChannel(thread);
  if (wide) return <Redirect href={{ pathname: '/places/[slug]/channels/[id]', params: { slug, id, thread } }} />;
  return (
    <ChatFrame wide={false} title="Thread" onBack={() => goBack({ pathname: '/places/[slug]/channels/[id]', params: { slug, id } })}>
      <ThreadBody thread={query.data} error={query.error} slug={slug} wide={false} />
    </ChatFrame>
  );
}
