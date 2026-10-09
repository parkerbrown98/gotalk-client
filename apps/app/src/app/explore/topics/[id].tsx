import { ApiError } from '@gotalk/api-client';
import { Badge, Button, Notice, Stack, Text, useTheme } from '@gotalk/ui';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { VoteControl, useVoteMode } from '@/components/feed';
import { Empty, PostItem, TagBadges } from '@/components/forum';
import { ScreenFrame } from '@/components/screen-frame';
import { useSession } from '@/lib/auth';
import { useFeedActions } from '@/lib/feeds';
import { usePosts, useTopic } from '@/lib/forums';
import { goBack, useWide } from '@/lib/layout';
import { useBoards, usePlace } from '@/lib/places';

/** A public topic, read-only, for people who have not signed in. */
export default function ExploreTopic() {
  const theme = useTheme();
  const c = theme.colors;
  const wide = useWide();
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useSession();
  const topicQuery = useTopic(id);
  const topic = topicQuery.data;
  const postsQuery = usePosts(id);
  const place = usePlace(topic?.place_id).data;
  const board = useBoards(topic?.place_id).data?.find((b) => b.id === topic?.board_id);
  const actions = useFeedActions();
  const voteMode = useVoteMode();

  useEffect(() => {
    if (topic?.id) actions.opened(topic.id);
  }, [topic?.id, actions]);

  if (session) return <Redirect href={topic && place ? { pathname: '/places/[slug]/topics/[id]', params: { slug: place.slug, id: topic.id } } : '/feed'} />;
  const back = () => goBack('/explore');
  if (topicQuery.isPending) return <ActivityIndicator style={{ flex: 1 }} />;
  if (!topic) {
    const gone = topicQuery.error instanceof ApiError && topicQuery.error.status < 500;
    return (
      <ScreenFrame title="Topic" onBack={back}>
        <Notice tone="danger" title={gone ? 'This topic does not exist, or it is not public.' : 'The topic could not be loaded.'}>
          {gone ? 'Sign in to see topics in places you belong to.' : 'Check your connection and try again.'}
        </Notice>
      </ScreenFrame>
    );
  }

  return (
    <ScreenFrame title={board?.name ?? 'Topic'} onBack={back} maxWidth={820} contentStyle={wide ? { paddingVertical: 24, paddingHorizontal: 40 } : { padding: theme.space.lg }}>
      <Stack gap="md">
        <Text variant="captionMd" tone="muted">
          {[place?.name, board?.name].filter(Boolean).join(' · ')}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.space.md }}>
          <View style={{ flex: 1, gap: theme.space.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.space.md }}>
              <Text variant={wide ? 'headingXl' : 'headingMd'} accessibilityRole="header" style={{ flexShrink: 1 }}>
                {topic.title}
              </Text>
              {topic.solution_post_id ? <Badge label="Solved" tone="success" /> : null}
              {topic.is_locked ? <Badge label="Locked" /> : null}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.space.sm }}>
              <TagBadges tags={topic.tags} />
              <Text variant="captionMd" tone="muted">
                Started by {topic.author.display_name} · {topic.reply_count} {topic.reply_count === 1 ? 'reply' : 'replies'}
              </Text>
            </View>
          </View>
          <VoteControl topic={topic} mode={voteMode(topic, place?.voting_enabled)} horizontal={!wide} />
        </View>
        {postsQuery.isPending ? <ActivityIndicator style={{ marginTop: 24 }} /> : null}
        {postsQuery.isError ? <Notice tone="danger" title="Posts could not be loaded." /> : null}
        <View>
          {postsQuery.posts.map((post, i) => (
            <View key={post.id} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.hairline }}>
              <PostItem
                post={post}
                topic={topic}
                wide={wide}
                userId={undefined}
                canModerate={false}
                canReact={false}
                canReply={false}
                solutionsEnabled={!!board?.solutions_enabled}
                slug={place?.slug ?? topic.place_id}
                onReply={() => undefined}
              />
            </View>
          ))}
        </View>
        {postsQuery.hasNextPage ? <Button title="Load more replies" variant="tertiary" loading={postsQuery.isFetchingNextPage} onPress={() => void postsQuery.fetchNextPage()} /> : null}
        {postsQuery.isSuccess && postsQuery.posts.length === 0 ? <Empty>There are no posts yet.</Empty> : null}
        <Notice tone="info" title="Join the conversation.">
          Sign in or create an account to reply, react and vote.
        </Notice>
        <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
          <Button title="Sign in" onPress={() => router.push('/sign-in')} />
          <Button title="Create an account" variant="tertiary" onPress={() => router.push('/register')} />
        </View>
      </Stack>
    </ScreenFrame>
  );
}
