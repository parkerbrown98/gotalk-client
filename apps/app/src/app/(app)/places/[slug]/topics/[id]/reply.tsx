import { Notice, Text, useTheme } from '@gotalk/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable } from 'react-native';

import { ReplyForm } from '@/components/reply-form';
import { ScreenFrame } from '@/components/screen-frame';
import { usePosts, useTopic } from '@/lib/forums';
import { goBack } from '@/lib/layout';

/** Full-screen reply, used on phones; `parent` is the post being answered. */
export default function Reply() {
  const theme = useTheme();
  const { slug, id, parent } = useLocalSearchParams<{ slug: string; id: string; parent?: string }>();
  const topic = useTopic(id);
  const posts = usePosts(id);
  const target = parent ? posts.posts.find((p) => p.id === parent) : undefined;
  const back = () => goBack({ pathname: '/places/[slug]/topics/[id]', params: { slug, id } });
  return (
    <ScreenFrame title="Reply" onBack={back} end={undefined} contentStyle={{ padding: theme.space.lg }}>
      {topic.isPending ? <ActivityIndicator /> : null}
      {topic.isError ? <Notice tone="danger" title="The topic could not be loaded." /> : null}
      {topic.data ? (
        <>
          <Pressable accessibilityRole="link" onPress={back} style={{ marginBottom: theme.space.md }}>
            <Text variant="captionMd" tone="muted" numberOfLines={2}>
              In {topic.data.title}
            </Text>
          </Pressable>
          <ReplyForm
            key={parent ?? 'topic'}
            topicId={id}
            slug={slug}
            parent={target}
            autoFocus
            minHeight={160}
            onPosted={() => {
              if (router.canGoBack()) router.back();
              else router.replace({ pathname: '/places/[slug]/topics/[id]', params: { slug, id } });
            }}
          />
        </>
      ) : null}
    </ScreenFrame>
  );
}
