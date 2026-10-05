import { unwrap, type Schemas } from '@gotalk/api-client';
import { draftKeys, parseDraft, type DraftData } from '@gotalk/core';
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useApiClient } from './api';
import { useSession } from './auth';
import { useGatewayReady } from './connection';
import { useActiveInstance } from './instances';

export type Topic = Schemas['Topic'];
export type Post = Schemas['Post'];
export type Board = Schemas['Board'];
export type Notification = Schemas['Notification'];
export type SearchResult = Schemas['SearchResult'];
export type Revision = Schemas['Revision'];
export type WatchLevel = 'watching' | 'normal' | 'muted';

export const TOPIC_PAGE = 25;
export const POST_PAGE = 50;
export const NOTIFICATION_PAGE = 30;
export const SEARCH_PAGE = 20;

export interface BoardNode {
  board: Board;
  depth: number;
}

/** Boards and categories in tree order, each with how deep it sits. The server already returns them depth first. */
export function boardTree(boards: readonly Board[]): BoardNode[] {
  const byId = new Map(boards.map((b) => [b.id, b]));
  const depthOf = (b: Board): number => {
    let d = 0;
    for (let p = b.parent_id ? byId.get(b.parent_id) : undefined; p && d < 5; p = p.parent_id ? byId.get(p.parent_id) : undefined) d++;
    return d;
  };
  return boards.map((board) => ({ board, depth: depthOf(board) }));
}

export type TopicFilter = 'latest' | 'unanswered' | 'solved';

/** Topics of a board, newest activity first (pinned first). Unanswered and solved narrow what has been loaded. */
export function useTopics(boardId: string | undefined, options: { tag?: string; filter: TopicFilter; archived?: boolean }) {
  const active = useActiveInstance();
  const client = useApiClient();
  const { tag, archived } = options;
  const query = useInfiniteQuery({
    queryKey: ['topics', active?.id, boardId, tag ?? null, !!archived],
    enabled: !!client && !!boardId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      unwrap(await client!.GET('/boards/{boardID}/topics', { params: { path: { boardID: boardId! }, query: { limit: TOPIC_PAGE, offset: pageParam, tag, archived } } })),
    getNextPageParam: (last) => last.next_offset ?? undefined,
  });
  const all = useMemo(() => query.data?.pages.flatMap((p) => p.items ?? []) ?? [], [query.data]);
  const topics = useMemo(
    () => (options.filter === 'unanswered' ? all.filter((t) => t.reply_count === 0) : options.filter === 'solved' ? all.filter((t) => !!t.solution_post_id) : all),
    [all, options.filter],
  );
  return { ...query, topics, loaded: all.length };
}

export function useTopic(topicId: string | undefined) {
  const active = useActiveInstance();
  const client = useApiClient();
  return useQuery({
    queryKey: ['topic', active?.id, topicId],
    enabled: !!client && !!topicId,
    queryFn: async () => unwrap(await client!.GET('/topics/{topicID}', { params: { path: { topicID: topicId! } } })),
  });
}

/** Posts of a topic in reading order. Threaded boards return them depth first with a `depth`. */
export function usePosts(topicId: string | undefined) {
  const active = useActiveInstance();
  const client = useApiClient();
  const query = useInfiniteQuery({
    queryKey: ['posts', active?.id, topicId],
    enabled: !!client && !!topicId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => unwrap(await client!.GET('/topics/{topicID}/posts', { params: { path: { topicID: topicId! }, query: { limit: POST_PAGE, offset: pageParam } } })),
    getNextPageParam: (last) => last.next_offset ?? undefined,
  });
  const posts = useMemo(() => query.data?.pages.flatMap((p) => p.items ?? []) ?? [], [query.data]);
  return { ...query, posts };
}

export function usePostRevisions(postId: string | undefined) {
  const active = useActiveInstance();
  const client = useApiClient();
  return useQuery({
    queryKey: ['revisions', active?.id, postId],
    enabled: !!client && !!postId,
    queryFn: async () => unwrap(await client!.GET('/posts/{postID}/revisions', { params: { path: { postID: postId! } } })) ?? [],
  });
}

/** Tags already used in a place, for suggestions. */
export function usePlaceTags(slug: string | undefined, q: string, enabled = true) {
  const active = useActiveInstance();
  const client = useApiClient();
  const prefix = q.trim().toLowerCase();
  return useQuery({
    queryKey: ['tags', active?.id, slug, prefix],
    enabled: !!client && !!slug && enabled,
    staleTime: 30_000,
    queryFn: async () => unwrap(await client!.GET('/places/{place}/tags', { params: { path: { place: slug! }, query: { q: prefix || undefined, limit: 8 } } })) ?? [],
  });
}

/** Members whose names start with the text, for @mention suggestions. */
export function useMemberSuggestions(slug: string | undefined, q: string | null) {
  const active = useActiveInstance();
  const client = useApiClient();
  const text = (q ?? '').trim();
  return useQuery({
    queryKey: ['member-suggest', active?.id, slug, text],
    enabled: !!client && !!slug && q !== null,
    staleTime: 30_000,
    queryFn: async () => unwrap(await client!.GET('/places/{place}/members', { params: { path: { place: slug! }, query: { q: text || undefined, limit: 6 } } })).items ?? [],
  });
}

export interface SearchParams {
  q: string;
  author?: string;
  tag?: string;
  board?: string;
  solved?: 'true' | 'false';
  after?: string;
  before?: string;
  topicsOnly?: boolean;
  sort: 'relevance' | 'newest' | 'oldest';
}

export function usePlaceSearch(slug: string | undefined, params: SearchParams) {
  const active = useActiveInstance();
  const client = useApiClient();
  const q = params.q.trim();
  const query = useInfiniteQuery({
    queryKey: ['search', active?.id, slug, { ...params, q }],
    enabled: !!client && !!slug && q.length > 0,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await client!.GET('/places/{place}/search', {
          params: {
            path: { place: slug! },
            query: {
              q,
              author: params.author || undefined,
              tag: params.tag || undefined,
              board: params.board || undefined,
              solved: params.solved,
              after: params.after || undefined,
              before: params.before || undefined,
              topics_only: params.topicsOnly || undefined,
              sort: params.sort,
              limit: SEARCH_PAGE,
              offset: pageParam,
            },
          },
        }),
      ),
    getNextPageParam: (last) => last.next_offset ?? undefined,
  });
  const results = useMemo(() => query.data?.pages.flatMap((p) => p.items ?? []) ?? [], [query.data]);
  return { ...query, results };
}

export function useNotifications(unreadOnly: boolean) {
  const active = useActiveInstance();
  const session = useSession();
  const client = useApiClient();
  const query = useInfiniteQuery({
    queryKey: ['notifications', active?.id, unreadOnly],
    enabled: !!client && !!session,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => unwrap(await client!.GET('/users/@me/notifications', { params: { query: { limit: NOTIFICATION_PAGE, offset: pageParam, unread: unreadOnly || undefined } } })),
    getNextPageParam: (last) => last.next_offset ?? undefined,
  });
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items ?? []) ?? [], [query.data]);
  return { ...query, items };
}

/** Unread notifications. The gateway pushes new ones; polling covers the time it is down. */
export function useUnreadCount() {
  const active = useActiveInstance();
  const session = useSession();
  const client = useApiClient();
  const live = useGatewayReady();
  return useQuery({
    queryKey: ['notifications-unread', active?.id],
    enabled: !!client && !!session,
    refetchInterval: live ? false : 60_000,
    refetchOnWindowFocus: !live,
    queryFn: async () => unwrap(await client!.GET('/users/@me/notifications/unread-count')).count,
  });
}

function patchTopics(data: InfiniteData<Schemas['PageTopic']> | undefined, topic: Topic) {
  if (!data) return data;
  return { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items?.map((t) => (t.id === topic.id ? { ...t, ...topic } : t)) ?? null })) };
}

function patchPosts(data: InfiniteData<Schemas['PagePost']> | undefined, id: string, apply: (p: Post) => Post) {
  if (!data) return data;
  return { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items?.map((x) => (x.id === id ? apply(x) : x)) ?? null })) };
}

/** Every forum mutation, each refreshing the lists that show its result. */
export function useForumActions() {
  const active = useActiveInstance();
  const client = useApiClient();
  const queryClient = useQueryClient();
  const id = active?.id;

  return useMemo(() => {
    const api = () => {
      if (!client) throw new Error('No active instance');
      return client;
    };
    const refreshTopic = (topicId: string) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['topic', id, topicId] }),
        queryClient.invalidateQueries({ queryKey: ['posts', id, topicId] }),
        queryClient.invalidateQueries({ queryKey: ['topics', id] }),
      ]);
    const keepTopic = (topic: Topic) => {
      queryClient.setQueryData(['topic', id, topic.id], topic);
      queryClient.setQueriesData<InfiniteData<Schemas['PageTopic']>>({ queryKey: ['topics', id] }, (d) => patchTopics(d, topic));
    };
    return {
      async createTopic(boardId: string, input: { title: string; content: string; tags: string[] }) {
        const created = unwrap(await api().POST('/boards/{boardID}/topics', { params: { path: { boardID: boardId } }, body: input }));
        await Promise.all([queryClient.invalidateQueries({ queryKey: ['topics', id] }), queryClient.invalidateQueries({ queryKey: ['boards', id] }), queryClient.invalidateQueries({ queryKey: ['tags', id] })]);
        return created.topic;
      },
      async reply(topicId: string, content: string, parentId?: string) {
        const post = unwrap(await api().POST('/topics/{topicID}/posts', { params: { path: { topicID: topicId } }, body: { content, parent_id: parentId } }));
        await refreshTopic(topicId);
        return post;
      },
      async editPost(post: Post, content: string) {
        const next = unwrap(await api().PATCH('/posts/{postID}', { params: { path: { postID: post.id } }, body: { content } }));
        queryClient.setQueriesData<InfiniteData<Schemas['PagePost']>>({ queryKey: ['posts', id, post.topic_id] }, (d) => patchPosts(d, post.id, (p) => ({ ...p, ...next, depth: p.depth })));
        await queryClient.invalidateQueries({ queryKey: ['revisions', id, post.id] });
        return next;
      },
      async deletePost(post: Post) {
        unwrap(await api().DELETE('/posts/{postID}', { params: { path: { postID: post.id } } }));
        await refreshTopic(post.topic_id);
      },
      async react(post: Post, emoji: string, on: boolean) {
        const params = { params: { path: { postID: post.id, emoji } } };
        unwrap(on ? await api().PUT('/posts/{postID}/reactions/{emoji}', params) : await api().DELETE('/posts/{postID}/reactions/{emoji}', params));
        await queryClient.invalidateQueries({ queryKey: ['posts', id, post.topic_id] });
      },
      async setSolution(topicId: string, postId: string | null) {
        const topic = postId
          ? unwrap(await api().PUT('/topics/{topicID}/solution', { params: { path: { topicID: topicId } }, body: { post_id: postId } }))
          : unwrap(await api().DELETE('/topics/{topicID}/solution', { params: { path: { topicID: topicId } } }));
        keepTopic(topic);
        return topic;
      },
      async updateTopic(topicId: string, patch: Schemas['UpdateTopicRequest']) {
        const topic = unwrap(await api().PATCH('/topics/{topicID}', { params: { path: { topicID: topicId } }, body: patch }));
        keepTopic(topic);
        await Promise.all([queryClient.invalidateQueries({ queryKey: ['topics', id] }), queryClient.invalidateQueries({ queryKey: ['tags', id] })]);
        return topic;
      },
      async deleteTopic(topicId: string) {
        unwrap(await api().DELETE('/topics/{topicID}', { params: { path: { topicID: topicId } } }));
        queryClient.removeQueries({ queryKey: ['topic', id, topicId] });
        await Promise.all([queryClient.invalidateQueries({ queryKey: ['topics', id] }), queryClient.invalidateQueries({ queryKey: ['boards', id] })]);
      },
      async markRead(topicId: string, postNumber: number) {
        unwrap(await api().PUT('/topics/{topicID}/read', { params: { path: { topicID: topicId } }, body: { post_number: postNumber } }));
        await queryClient.invalidateQueries({ queryKey: ['topics', id] });
      },
      async watchTopic(topicId: string, level: WatchLevel) {
        unwrap(await api().PUT('/topics/{topicID}/subscription', { params: { path: { topicID: topicId } }, body: { level } }));
        await queryClient.invalidateQueries({ queryKey: ['topic', id, topicId] });
      },
      async watchBoard(boardId: string, slug: string, level: WatchLevel) {
        unwrap(await api().PUT('/boards/{boardID}/subscription', { params: { path: { boardID: boardId } }, body: { level } }));
        await queryClient.invalidateQueries({ queryKey: ['boards', id, slug] });
      },
      async watchPlace(slug: string, level: WatchLevel) {
        unwrap(await api().PUT('/places/{place}/subscription', { params: { path: { place: slug } }, body: { level } }));
        await queryClient.invalidateQueries({ queryKey: ['place', id, slug] });
      },
      async createBoard(slug: string, input: Schemas['CreateBoardRequest']) {
        const board = unwrap(await api().POST('/places/{place}/boards', { params: { path: { place: slug } }, body: input }));
        await queryClient.invalidateQueries({ queryKey: ['boards', id, slug] });
        return board;
      },
      async markNotificationRead(notificationId: string) {
        unwrap(await api().POST('/users/@me/notifications/{notificationID}/read', { params: { path: { notificationID: notificationId } } }));
        await Promise.all([queryClient.invalidateQueries({ queryKey: ['notifications', id] }), queryClient.invalidateQueries({ queryKey: ['notifications-unread', id] })]);
      },
      async markAllNotificationsRead() {
        unwrap(await api().POST('/users/@me/notifications/read-all'));
        await Promise.all([queryClient.invalidateQueries({ queryKey: ['notifications', id] }), queryClient.invalidateQueries({ queryKey: ['notifications-unread', id] })]);
      },
      async dismissNotification(notificationId: string) {
        unwrap(await api().DELETE('/users/@me/notifications/{notificationID}', { params: { path: { notificationID: notificationId } } }));
        await Promise.all([queryClient.invalidateQueries({ queryKey: ['notifications', id] }), queryClient.invalidateQueries({ queryKey: ['notifications-unread', id] })]);
      },
    };
  }, [client, id, queryClient]);
}

export type DraftState = 'idle' | 'saving' | 'saved' | 'error';

const DRAFT_DELAY_MS = 800;

/**
 * A draft kept on the server under `key`, so it follows the person between devices. `loaded` turns
 * true once the stored draft (if any) has been read; typing before that would overwrite it.
 */
export function useServerDraft(key: string | null) {
  const active = useActiveInstance();
  const client = useApiClient();
  const [stored, setStored] = useState<DraftData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState<DraftState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<{ key: string; data: DraftData } | null>(null);
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    setStored(null);
    setLoaded(false);
    setState('idle');
    if (!client || !key) return;
    let cancelled = false;
    client
      .GET('/users/@me/drafts/{key}', { params: { path: { key } } })
      .then((res) => {
        if (cancelled) return;
        setStored(res.response.ok ? parseDraft(res.data?.data) : null);
        setLoaded(true);
      })
      .catch(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [client, key, active?.id]);

  const flush = useCallback(async () => {
    const pending = latest.current;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!client || !pending) return;
    const { key: k, data } = pending;
    latest.current = null;
    setState('saving');
    try {
      const empty = !data.content.trim() && !data.title?.trim() && !(data.tags && data.tags.length);
      if (empty) await client.DELETE('/users/@me/drafts/{key}', { params: { path: { key: k } } });
      else unwrap(await client.PUT('/users/@me/drafts/{key}', { params: { path: { key: k } }, body: { data: { ...data } } }));
      setState(empty ? 'idle' : 'saved');
    } catch {
      setState('error');
    }
  }, [client]);

  const save = useCallback(
    (data: DraftData) => {
      if (!keyRef.current) return;
      latest.current = { key: keyRef.current, data };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), DRAFT_DELAY_MS);
    },
    [flush],
  );

  /** Removes the draft, for after the post went out or the person discarded it. */
  const discard = useCallback(async () => {
    latest.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const k = keyRef.current;
    setState('idle');
    if (!client || !k) return;
    await client.DELETE('/users/@me/drafts/{key}', { params: { path: { key: k } } }).catch(() => undefined);
  }, [client]);

  // Leaving the screen with unsaved typing still sends it.
  useEffect(() => () => void flush(), [flush, key]);

  return { stored, loaded, state, save, discard, flush };
}

export { draftKeys };
