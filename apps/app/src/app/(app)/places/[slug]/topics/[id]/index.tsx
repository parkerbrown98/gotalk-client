import { ApiError } from '@gotalk/api-client';
import { validateTopic } from '@gotalk/core';
import { Badge, Button, Dialog, Icon, Notice, PillTabs, Stack, Text, TextField, useTheme } from '@gotalk/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { VoteControl, useVoteMode } from '@/components/feed';
import { ActionList, Empty, messageFor, PostItem, TagBadges, WatchButton } from '@/components/forum';
import { ReplyForm } from '@/components/reply-form';
import { ScreenFrame } from '@/components/screen-frame';
import { TagInput } from '@/components/tag-input';
import { useMe } from '@/lib/api';
import { useFeedActions } from '@/lib/feeds';
import { useForumActions, usePosts, useTopic, type Post, type Topic } from '@/lib/forums';
import { goBack, useWide } from '@/lib/layout';
import { useBoardAccess, useBoards, usePlace, usePlaceAccess } from '@/lib/places';

function EditTopicDialog({ topic, slug, visible, onClose }: { topic: Topic; slug: string; visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const actions = useForumActions();
  const [title, setTitle] = useState(topic.title);
  const [tags, setTags] = useState<string[]>(topic.tags ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (visible) {
      setTitle(topic.title);
      setTags(topic.tags ?? []);
      setError(null);
    }
  }, [visible, topic.title, topic.tags]);

  async function save() {
    const problem = validateTopic({ title, content: 'x', tags });
    if (problem) return setError(problem.message);
    setBusy(true);
    try {
      await actions.updateTopic(topic.id, { title: title.trim().replace(/\s+/g, ' '), tags });
      onClose();
    } catch (e) {
      setError(messageFor(e, 'Could not save the changes. Try again.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog visible={visible} onClose={onClose}>
      <Text variant="headingMd" accessibilityRole="header">
        Edit title and tags
      </Text>
      <TextField label="Title" value={title} onChangeText={setTitle} maxLength={400} />
      <TagInput slug={slug} value={tags} onChange={setTags} />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: theme.space.sm }}>
        <Button title="Cancel" variant="tertiary" onPress={onClose} />
        <Button title="Save" loading={busy} onPress={save} />
      </View>
    </Dialog>
  );
}

/** One topic: its posts (flat or threaded), reactions, the accepted solution, and a way to reply. */
export default function TopicScreen() {
  const theme = useTheme();
  const c = theme.colors;
  const wide = useWide();
  const { slug, id } = useLocalSearchParams<{ slug: string; id: string }>();
  const me = useMe().data;
  const topicQuery = useTopic(id);
  const topic = topicQuery.data;
  const postsQuery = usePosts(id);
  const place = usePlace(slug).data;
  const access = usePlaceAccess(place);
  const board = useBoards(slug, access.isMember).data?.find((b) => b.id === topic?.board_id);
  const boardAccess = useBoardAccess(board);
  const actions = useForumActions();
  const feedActions = useFeedActions();
  const voteMode = useVoteMode();
  const [replyTo, setReplyTo] = useState<Post | undefined>();
  const [voteProblem, setVoteProblem] = useState<string | null>(null);
  const [layout, setLayout] = useState<'threaded' | 'flat'>('threaded');
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const marked = useRef(0);

  const threaded = board?.reply_mode === 'threaded' && layout === 'threaded';
  const posts = useMemo(() => (board?.reply_mode === 'threaded' && layout === 'flat' ? [...postsQuery.posts].sort((a, b) => a.post_number - b.post_number) : postsQuery.posts), [postsQuery.posts, board?.reply_mode, layout]);
  const byNumber = useMemo(() => new Map(postsQuery.posts.map((p) => [p.id, p])), [postsQuery.posts]);

  const canModerate = boardAccess.can('MANAGE_POSTS');
  const isAuthor = !!me && topic?.author.id === me.id;
  const canReply = !!topic && !topic.is_archived && (!topic.is_locked || canModerate) && boardAccess.can('REPLY_TO_TOPICS');
  const canReact = boardAccess.can('ADD_REACTIONS');

  // However the topic was reached (a feed, a forum, search, the inbox, a link), opening it marks it read.
  useEffect(() => {
    if (topic?.id) feedActions.opened(topic.id);
  }, [topic?.id, feedActions]);

  // Opening or reading further records the position, so the topic list stops showing it as unread.
  const highest = posts.reduce((n, p) => Math.max(n, p.post_number), 0);
  useEffect(() => {
    if (!topic || highest === 0 || highest <= marked.current || highest <= (topic.last_read_post_number ?? 0)) return;
    marked.current = highest;
    void actions.markRead(topic.id, highest).catch(() => {
      marked.current = 0;
    });
  }, [topic, highest, actions]);

  if (topicQuery.isPending) return <ActivityIndicator style={{ flex: 1 }} />;
  if (!topic) {
    const gone = topicQuery.error instanceof ApiError && topicQuery.error.status < 500;
    return (
      <ScreenFrame title="Topic" onBack={() => goBack({ pathname: '/places/[slug]', params: { slug } })}>
        <Notice tone="danger" title={gone ? 'This topic does not exist, or you cannot see it.' : 'The topic could not be loaded.'}>
          {gone ? 'It may have been deleted.' : 'Check your connection and try again.'}
        </Notice>
      </ScreenFrame>
    );
  }

  const back = () => goBack({ pathname: '/places/[slug]/boards/[id]', params: { slug, id: topic.board_id } });
  const run = async (work: () => Promise<unknown>, fallback: string) => {
    setProblem(null);
    try {
      await work();
    } catch (e) {
      setProblem(messageFor(e, fallback));
    }
  };

  const items = [
    ...(canModerate ? [{ key: 'edit', label: 'Edit title and tags', icon: 'settings' as const, onPress: () => setEditing(true) }] : []),
    ...(canModerate
      ? [
          { key: 'pin', label: topic.is_pinned ? 'Unpin topic' : 'Pin topic', icon: 'pin' as const, onPress: () => void run(() => actions.updateTopic(topic.id, { is_pinned: !topic.is_pinned }), 'Could not change the topic.') },
          { key: 'lock', label: topic.is_locked ? 'Unlock replies' : 'Lock replies', icon: 'lock' as const, onPress: () => void run(() => actions.updateTopic(topic.id, { is_locked: !topic.is_locked }), 'Could not change the topic.') },
          { key: 'archive', label: topic.is_archived ? 'Unarchive topic' : 'Archive topic', icon: 'clock' as const, onPress: () => void run(() => actions.updateTopic(topic.id, { is_archived: !topic.is_archived }), 'Could not change the topic.') },
        ]
      : []),
    ...(canModerate || isAuthor ? [{ key: 'delete', label: 'Delete topic', icon: 'trash' as const, danger: true, onPress: () => setConfirmDelete(true) }] : []),
  ];

  const replyBlock = canReply ? (
    wide ? (
      <View style={{ borderTopWidth: 1, borderTopColor: c.hairline, paddingTop: theme.space.lg, marginTop: theme.space.lg }}>
        <ReplyForm key={replyTo?.id ?? 'topic'} topicId={topic.id} slug={slug} parent={replyTo} onClearParent={() => setReplyTo(undefined)} onPosted={() => setReplyTo(undefined)} />
      </View>
    ) : (
      <Button title="Reply to the topic" variant="tertiary" onPress={() => router.push({ pathname: '/places/[slug]/topics/[id]/reply', params: { slug, id: topic.id } })} />
    )
  ) : (
    <Notice tone="info" title={topic.is_archived ? 'This topic is archived.' : topic.is_locked ? 'This topic is locked.' : 'You cannot reply here.'}>
      {topic.is_archived || topic.is_locked ? 'No new replies can be added.' : 'Ask a moderator if you think that is a mistake.'}
    </Notice>
  );

  const heading = (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.space.md }}>
      <Stack gap="sm" style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.space.md }}>
          <Text variant={wide ? 'headingXl' : 'headingMd'} accessibilityRole="header" style={{ flexShrink: 1 }}>
            {topic.title}
          </Text>
          {topic.solution_post_id ? <Badge label="Solved" tone="success" /> : null}
          {topic.is_locked ? <Badge label="Locked" /> : null}
          {topic.is_archived ? <Badge label="Archived" /> : null}
          {topic.is_pinned ? <Badge label="Pinned" /> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.space.sm }}>
          <TagBadges tags={topic.tags} />
          <Text variant="captionMd" tone="muted">
            Started by {topic.author.display_name} · {topic.reply_count} {topic.reply_count === 1 ? 'reply' : 'replies'}
          </Text>
        </View>
        {voteProblem ? (
          <Text variant="captionMd" tone="danger">
            {voteProblem}
          </Text>
        ) : null}
      </Stack>
      <VoteControl topic={topic} mode={voteMode(topic, place?.voting_enabled)} horizontal={!wide} onError={setVoteProblem} />
    </View>
  );

  const controls = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
      {board?.reply_mode === 'threaded' ? (
        <PillTabs
          options={[
            { value: 'flat', label: 'Flat' },
            { value: 'threaded', label: 'Threaded' },
          ]}
          value={layout}
          onChange={setLayout}
        />
      ) : null}
      <WatchButton scope="topic" level={topic.subscription ?? board?.subscription ?? 'normal'} onChange={(level) => actions.watchTopic(topic.id, level)} />
      {items.length > 0 && wide ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Topic actions" onPress={() => setMenu(true)} hitSlop={8} style={{ width: 32, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radii.md, backgroundColor: c.surfaceElevated }}>
          <Icon name="more" size={16} color={c.onDark} />
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <ScreenFrame title={board?.name ?? 'Topic'} onBack={back} end={items.length > 0 && !wide ? <Pressable accessibilityRole="button" accessibilityLabel="Topic actions" onPress={() => setMenu(true)} hitSlop={12}><Icon name="more" size={20} color={c.onDark} /></Pressable> : undefined} maxWidth={820} contentStyle={wide ? { paddingVertical: 24, paddingHorizontal: 40 } : { padding: theme.space.lg }}>
      <Stack gap="md">
        {wide ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.space.md }}>
            <Pressable accessibilityRole="link" onPress={back} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="chevronLeft" size={16} color={c.mute} />
              <Text variant="bodySm" tone="muted">
                {board?.name ?? 'Back'}
              </Text>
            </Pressable>
            {controls}
          </View>
        ) : (
          <View style={{ alignItems: 'flex-end' }}>{controls}</View>
        )}
        {heading}
        {problem ? <Notice tone="danger">{problem}</Notice> : null}
        {postsQuery.isPending ? <ActivityIndicator style={{ marginTop: 24 }} /> : null}
        {postsQuery.isError ? (
          <Stack gap="md">
            <Notice tone="danger" title="Posts could not be loaded." />
            <Button title="Try again" variant="tertiary" onPress={() => void postsQuery.refetch()} />
          </Stack>
        ) : null}
        <View>
          {posts.map((post, i) => {
            const depth = threaded ? Math.min(post.depth ?? 0, wide ? 4 : 3) : 0;
            const parent = post.parent_id ? byNumber.get(post.parent_id) : undefined;
            const first = i === 0;
            return (
              <View key={post.id} style={[{ borderTopWidth: first || depth > 0 ? 0 : 1, borderTopColor: c.hairline }, depth > 0 ? { marginLeft: depth * (wide ? 20 : 12), paddingLeft: wide ? 20 : 12, borderLeftWidth: 1, borderLeftColor: c.hairline } : null]}>
                <PostItem
                  post={post}
                  topic={topic}
                  indent={depth}
                  wide={wide}
                  userId={me?.id}
                  canModerate={canModerate}
                  canReact={canReact}
                  canReply={canReply}
                  solutionsEnabled={!!board?.solutions_enabled}
                  slug={slug}
                  note={parent ? `replying to #${parent.post_number}` : undefined}
                  onReply={(p) => (wide ? setReplyTo(p) : router.push({ pathname: '/places/[slug]/topics/[id]/reply', params: { slug, id: topic.id, parent: p.id } }))}
                />
              </View>
            );
          })}
        </View>
        {postsQuery.hasNextPage ? <Button title="Load more replies" variant="tertiary" loading={postsQuery.isFetchingNextPage} onPress={() => void postsQuery.fetchNextPage()} /> : null}
        {postsQuery.isSuccess && posts.length === 0 ? <Empty>There are no posts yet.</Empty> : null}
        {replyBlock}
      </Stack>

      <ActionList items={items} visible={menu} onClose={() => setMenu(false)} />
      <EditTopicDialog topic={topic} slug={slug} visible={editing} onClose={() => setEditing(false)} />
      <Dialog visible={confirmDelete} onClose={() => setConfirmDelete(false)}>
        <Text variant="headingMd" accessibilityRole="header">
          Delete this topic?
        </Text>
        <Text variant="bodySm" tone="muted">
          The topic and its replies are removed for everyone.
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: theme.space.sm }}>
          <Button title="Keep" variant="tertiary" onPress={() => setConfirmDelete(false)} />
          <Button
            title="Delete topic"
            variant="danger"
            onPress={async () => {
              setConfirmDelete(false);
              await run(async () => {
                await actions.deleteTopic(topic.id);
                back();
              }, 'Could not delete the topic. Try again.');
            }}
          />
        </View>
      </Dialog>
    </ScreenFrame>
  );
}
