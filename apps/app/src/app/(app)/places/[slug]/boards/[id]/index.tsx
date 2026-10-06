import { Badge, Button, Icon, ListCard, ListRow, Notice, PillTabs, Stack, Text, useTheme } from '@gotalk/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Empty, TopicRow, WatchButton } from '@/components/forum';
import { ScreenFrame } from '@/components/screen-frame';
import { boardTree, useForumActions, useTopics, type TopicFilter } from '@/lib/forums';
import { goBack, useWide } from '@/lib/layout';
import { useBoardAccess, useBoards, usePlace, usePlaceAccess } from '@/lib/places';

const filters: Array<{ value: TopicFilter; label: string }> = [
  { value: 'latest', label: 'Latest' },
  { value: 'unanswered', label: 'Unanswered' },
  { value: 'solved', label: 'Solved' },
];

/** A forum's topics, pinned first, with filters and a way to start a new one. */
export default function Board() {
  const theme = useTheme();
  const c = theme.colors;
  const wide = useWide();
  const { slug, id, tag } = useLocalSearchParams<{ slug: string; id: string; tag?: string }>();
  const place = usePlace(slug).data;
  const access = usePlaceAccess(place);
  const boards = useBoards(slug, access.isMember);
  const board = boards.data?.find((b) => b.id === id);
  const boardAccess = useBoardAccess(board);
  const actions = useForumActions();
  const [filter, setFilter] = useState<TopicFilter>('latest');
  const [archived, setArchived] = useState(false);
  const isForum = board?.kind === 'board';
  const topics = useTopics(isForum ? id : undefined, { tag, filter, archived });
  const children = boardTree(boards.data ?? []).filter((n) => n.board.parent_id === id);
  const canPost = isForum && boardAccess.can('CREATE_TOPICS');
  const canModerate = boardAccess.can('MANAGE_POSTS');

  const newTopic = () => router.push({ pathname: '/places/[slug]/boards/[id]/new', params: { slug, id } });
  const search = () => router.push({ pathname: '/places/[slug]/search', params: { slug, board: board?.id ?? '' } });
  const canPermissions = !!board && boardAccess.can('MANAGE_BOARDS');
  const permissions = () => board && router.push({ pathname: '/places/[slug]/settings/permissions/[id]', params: { slug, id: board.id, kind: 'board' } });

  const watch = board ? <WatchButton scope="board" level={board.subscription} onChange={(level) => actions.watchBoard(board.id, slug, level)} /> : null;

  const header = wide ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md, paddingHorizontal: 24, height: 52, borderBottomWidth: 1, borderBottomColor: c.hairline }}>
      <Icon name="forum" size={16} color={c.mute} />
      <Text variant="bodyStrong" tone="onDark" accessibilityRole="header">
        {board?.name ?? 'Forum'}
      </Text>
      {board?.description ? (
        <Text variant="captionMd" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
          {board.description}
        </Text>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      {watch}
      {canPermissions ? <Button title="Permissions" variant="tertiary" size="sm" onPress={permissions} /> : null}
      <Button title="Search" variant="tertiary" size="sm" onPress={search} />
      {canPost ? <Button title="New topic" onPress={newTopic} /> : null}
    </View>
  ) : null;

  return (
    <ScreenFrame
      title={board?.name ?? 'Forum'}
      onBack={() => goBack({ pathname: '/places/[slug]', params: { slug } })}
      end={
        <Pressable accessibilityRole="button" accessibilityLabel="Search this forum" hitSlop={12} onPress={search}>
          <Icon name="search" size={20} color={c.onDark} />
        </Pressable>
      }
      maxWidth={1000}
      contentStyle={{ padding: 0 }}
    >
      {header}
      {boards.isPending ? <ActivityIndicator style={{ marginTop: 48 }} /> : null}
      {!boards.isPending && !board ? (
        <View style={{ padding: theme.space.lg }}>
          <Notice tone="danger" title="This forum does not exist, or you cannot see it.">
            Pick another from the list.
          </Notice>
        </View>
      ) : null}

      {board && !isForum ? (
        <Stack gap="lg" style={{ padding: wide ? 24 : theme.space.lg }}>
          <Text variant="headingLg">{board.name}</Text>
          {children.length === 0 ? (
            <Empty>No forums in this category yet.</Empty>
          ) : (
            <ListCard>
              {children.map((n) => (
                <ListRow key={n.board.id} icon="forum" title={n.board.name} subtitle={n.board.description || undefined} chevron onPress={() => router.push({ pathname: '/places/[slug]/boards/[id]', params: { slug, id: n.board.id } })} />
              ))}
            </ListCard>
          )}
        </Stack>
      ) : null}

      {isForum ? (
        <View>
          {wide ? null : (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: theme.space.lg, paddingBottom: theme.space.sm, gap: theme.space.sm }}>
              <Text variant="captionMd" tone="muted" style={{ flex: 1 }} numberOfLines={2}>
                {board.description}
              </Text>
              {canPermissions ? <Button title="Permissions" variant="tertiary" size="sm" onPress={permissions} /> : null}
              {watch}
            </View>
          )}
          {canPost && !wide ? (
            <View style={{ paddingHorizontal: theme.space.lg }}>
              <Button title="New topic" onPress={newTopic} />
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', gap: theme.space.sm, paddingHorizontal: wide ? 24 : theme.space.lg, paddingVertical: 12 }}>
            <PillTabs options={filters} value={filter} onChange={setFilter} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
              {tag ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`Clear tag ${tag}`} onPress={() => router.setParams({ tag: undefined })} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Badge label={`tag: ${tag}`} tone="info" />
                  <Icon name="x" size={14} color={c.mute} />
                </Pressable>
              ) : null}
              {canModerate ? <Button title={archived ? 'Hide archived' : 'Show archived'} variant="secondary" size="sm" onPress={() => setArchived((a) => !a)} /> : null}
            </View>
          </View>

          {wide ? (
            <View style={{ flexDirection: 'row', gap: theme.space.md, paddingHorizontal: 24, paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.hairline, borderBottomWidth: 1, borderBottomColor: c.hairline }}>
              <Text variant="captionMd" tone="muted" style={{ flex: 1, paddingLeft: 52 }}>
                Topic
              </Text>
              <Text variant="captionMd" tone="muted" style={{ width: 72, textAlign: 'right' }}>
                Replies
              </Text>
              <Text variant="captionMd" tone="muted" style={{ width: 120, textAlign: 'right' }}>
                Last activity
              </Text>
            </View>
          ) : null}

          {topics.isPending ? <ActivityIndicator style={{ marginTop: 32 }} /> : null}
          {topics.isError ? (
            <View style={{ padding: theme.space.lg, gap: theme.space.md }}>
              <Notice tone="danger" title="Topics could not be loaded.">
                Check your connection and try again.
              </Notice>
              <Button title="Try again" variant="tertiary" onPress={() => void topics.refetch()} />
            </View>
          ) : null}
          {topics.topics.map((t, i) => (
            <View key={t.id} style={{ borderTopWidth: wide || i === 0 ? 0 : 1, borderTopColor: c.hairline, borderBottomWidth: wide ? 1 : 0, borderBottomColor: c.hairline }}>
              <TopicRow topic={t} wide={wide} onPress={() => router.push({ pathname: '/places/[slug]/topics/[id]', params: { slug, id: t.id } })} />
            </View>
          ))}
          {topics.isSuccess && topics.topics.length === 0 ? (
            <Empty>
              {filter === 'latest' ? (canPost ? 'No topics yet. Start the first one.' : 'No topics yet.') : `No ${filter} topics among the ${topics.loaded} loaded so far.`}
            </Empty>
          ) : null}
          {topics.hasNextPage ? (
            <View style={{ padding: theme.space.lg, alignItems: 'center' }}>
              <Button title="Load more topics" variant="tertiary" loading={topics.isFetchingNextPage} onPress={() => void topics.fetchNextPage()} />
            </View>
          ) : null}
        </View>
      ) : null}

    </ScreenFrame>
  );
}
