import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError, unwrap, type GotalkClient, type Schemas } from '@gotalk/api-client';
import {
  batches,
  coveredByMarkAll,
  createFeedReadStore,
  DEFAULT_FEED_WINDOW,
  FEED_SORTS,
  FEED_WINDOWS,
  feedItemsOf,
  feedQuery,
  patchAllFeedItems,
  patchFeedPages,
  withAllRead,
  withOpened,
  withReadState,
  withUnread,
  withVote,
  type FeedFilters,
  type FeedPages,
  type FeedScope,
  type FeedSort,
  type FeedTopic,
  type FeedWindow,
  type TopicReadState,
} from '@gotalk/core';
import { useInfiniteQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import { useApiClient, useInstanceInfo } from './api';
import { authManager, useSession } from './auth';
import { useGatewayReady, useOnline } from './connection';
import { classifyFailure } from './failure';
import { useActiveInstance } from './instances';

export type { FeedTopic } from '@gotalk/core';
type Topic = Schemas['Topic'];

export const FEED_PAGE = 25;
const DEFAULT_READ_BATCH = 100;

/** Query keys. Signed-in and signed-out copies are kept apart, since only one carries `viewer`. */
export const feedKeys = {
  all: (inst: string | undefined) => ['feed', inst] as const,
  place: (inst: string | undefined, signedIn: boolean, slug: string | undefined, query: object) => ['feed', inst, signedIn ? 'me' : 'anon', 'place', slug, query] as const,
  instance: (inst: string | undefined, signedIn: boolean, scope: FeedScope, query: object) => ['feed', inst, signedIn ? 'me' : 'anon', scope, query] as const,
};

function useFeedPages(key: readonly unknown[], enabled: boolean, load: (client: GotalkClient, cursor: string | undefined) => Promise<Schemas['FeedPage']>) {
  const client = useApiClient();
  const query = useInfiniteQuery({
    queryKey: key,
    enabled: !!client && enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => load(client!, pageParam),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
  const { pinned, items } = useMemo(() => feedItemsOf(query.data?.pages), [query.data]);
  return { ...query, pinned, items, asOf: query.data?.pages[0]?.as_of };
}

/** A place's feed: topics from every forum the caller can read. */
export function usePlaceFeed(slug: string | undefined, filters: FeedFilters, enabled = true) {
  const active = useActiveInstance();
  const session = useSession();
  const query = useMemo(() => feedQuery(filters, 'place'), [filters]);
  return useFeedPages(feedKeys.place(active?.id, !!session, slug, query), !!slug && enabled, async (client, cursor) =>
    unwrap(await client.GET('/places/{place}/feed', { params: { path: { place: slug! }, query: { ...query, limit: FEED_PAGE, cursor } } })),
  );
}

/** Topics across the caller's places (`home`) or public topics on the instance (`all`). */
export function useInstanceFeed(scope: FeedScope, filters: FeedFilters, enabled = true) {
  const active = useActiveInstance();
  const session = useSession();
  const query = useMemo(() => feedQuery(filters, 'instance'), [filters]);
  return useFeedPages(feedKeys.instance(active?.id, !!session, scope, query), enabled && (scope === 'all' || !!session), async (client, cursor) =>
    unwrap(await client.GET('/feed', { params: { query: { ...query, scope, limit: FEED_PAGE, cursor } } })),
  );
}

/** What the instance says about feeds and votes. Instances from before feeds have neither. */
export function useFeedCapabilities() {
  const info = useInstanceInfo().data;
  return {
    feeds: info?.features.feed ?? false,
    votes: info?.features.topic_votes ?? false,
    sorts: info?.feed?.sorts,
    readBatch: info?.feed?.read_batch || DEFAULT_READ_BATCH,
  };
}

// ---- Remembered sort, per instance and feed ----

interface SortPref {
  sort: FeedSort;
  window?: FeedWindow;
}

const prefsStore = createStore<{ byInstance: Record<string, Record<string, SortPref>> }>(() => ({ byInstance: {} }));
const prefsKey = (inst: string) => `gotalk.feed.prefs.${inst}`;
const loadingPrefs = new Set<string>();

function parsePrefs(raw: string | null): Record<string, SortPref> {
  if (!raw) return {};
  try {
    const out: Record<string, SortPref> = {};
    for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, { sort?: string; window?: string }>)) {
      if (!(FEED_SORTS as readonly string[]).includes(v?.sort ?? '')) continue;
      out[k] = { sort: v.sort as FeedSort, window: (FEED_WINDOWS as readonly string[]).includes(v.window ?? '') ? (v.window as FeedWindow) : undefined };
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * The sort last used on a feed (`home`, `all`, or `place`), remembered on this device per instance.
 * `loaded` turns true once the stored choice has been read, so a screen does not flash the default.
 */
export function useSortPreference(feed: string): { pref: SortPref | undefined; loaded: boolean; remember: (pref: SortPref) => void } {
  const inst = useActiveInstance()?.id;
  const all = useStore(prefsStore, (s) => (inst ? s.byInstance[inst] : undefined));
  useEffect(() => {
    if (!inst || loadingPrefs.has(inst)) return;
    loadingPrefs.add(inst);
    void AsyncStorage.getItem(prefsKey(inst))
      .catch(() => null)
      .then((raw) => prefsStore.setState((s) => ({ byInstance: { ...s.byInstance, [inst]: { ...parsePrefs(raw), ...s.byInstance[inst] } } })));
  }, [inst]);
  return useMemo(
    () => ({
      pref: all?.[feed],
      loaded: !!all,
      remember: (pref: SortPref) => {
        if (!inst) return;
        const next = { ...prefsStore.getState().byInstance[inst], [feed]: { sort: pref.sort, window: pref.window && pref.window !== DEFAULT_FEED_WINDOW ? pref.window : undefined } };
        prefsStore.setState((s) => ({ byInstance: { ...s.byInstance, [inst]: next } }));
        void AsyncStorage.setItem(prefsKey(inst), JSON.stringify(next)).catch(() => undefined);
      },
    }),
    [all, feed, inst],
  );
}

// ---- Read record (signed out) and queued opens (offline) ----

export const feedReads = createFeedReadStore(AsyncStorage);

/** Topic IDs this device remembers opening while signed out on the active instance. */
export function useLocalReads(): ReadonlySet<string> {
  const inst = useActiveInstance()?.id;
  const list = useStore(feedReads.store, (s) => (inst ? s.local[inst] : undefined));
  useEffect(() => {
    if (inst) void feedReads.hydrate(inst);
  }, [inst]);
  return useMemo(() => new Set(list ?? []), [list]);
}

// ---- Cache updates ----

type TopicLike = Topic | FeedTopic;
type Patch = <T extends TopicLike>(t: T) => T;

/** Applies a change to every cached copy of a topic: feeds, forum lists and the topic itself. */
export function patchTopicEverywhere(qc: QueryClient, inst: string | undefined, topicId: string, patch: Patch): void {
  qc.setQueriesData<FeedPages>({ queryKey: feedKeys.all(inst) }, (d) => patchFeedPages(d, topicId, patch));
  qc.setQueriesData<InfiniteData<Schemas['PageTopic']>>({ queryKey: ['topics', inst] }, (d) =>
    d ? { ...d, pages: d.pages.map((p) => ({ ...p, items: p.items?.map((t) => (t.id === topicId ? patch(t) : t)) ?? null })) } : d,
  );
  qc.setQueryData<Topic>(['topic', inst, topicId], (t) => (t ? patch(t) : t));
}

/** A read state from the server, applied wherever the topic is cached. */
export function applyReadState(qc: QueryClient, inst: string | undefined, state: TopicReadState): void {
  patchTopicEverywhere(qc, inst, state.topic_id, (t) => withReadState(t, state));
}

/**
 * After a place (or a forum in it) was marked read: everything there last active by `before` is read.
 * The cached activity times may be behind (a reply since the feed loaded stays unread on the server),
 * so the lists are refetched to settle on the server's answer.
 */
export function applyMarkAll(qc: QueryClient, inst: string | undefined, placeId: string, before: string): void {
  qc.setQueriesData<FeedPages>({ queryKey: feedKeys.all(inst) }, (d) =>
    patchAllFeedItems(d, (it) => (it.place_id === placeId && coveredByMarkAll(it, before) ? withAllRead(it) : it)),
  );
  void qc.invalidateQueries({ queryKey: feedKeys.all(inst) });
  void qc.invalidateQueries({ queryKey: ['topics', inst] });
}

const isNetworkFailure = (e: unknown) => {
  const f = classifyFailure(e);
  return f.kind === 'network' || f.kind === 'rate_limited' || (e instanceof ApiError && e.status >= 500);
};

/** Feed mutations. Each changes the caches first and puts them back if the server says no. */
export function useFeedActions() {
  const active = useActiveInstance();
  const session = useSession();
  const client = useApiClient();
  const qc = useQueryClient();
  const inst = active?.id;
  const signedIn = !!session;

  return useMemo(() => {
    const api = () => {
      if (!client) throw new Error('No active instance');
      return client;
    };
    const restore = (topicId: string, before: TopicLike | undefined) => {
      if (!before) return;
      patchTopicEverywhere(qc, inst, topicId, (t) => ({ ...t, score: before.score, upvotes: before.upvotes, downvotes: before.downvotes, viewer: before.viewer, unread_count: before.unread_count, last_read_post_number: before.last_read_post_number }));
    };
    return {
      /** Votes 1 or -1, or clears the vote with 0. */
      async vote(topic: TopicLike, next: -1 | 0 | 1) {
        patchTopicEverywhere(qc, inst, topic.id, (t) => withVote(t, next));
        try {
          const params = { params: { path: { topicID: topic.id } } };
          const fresh = next === 0 ? unwrap(await api().DELETE('/topics/{topicID}/vote', params)) : unwrap(await api().PUT('/topics/{topicID}/vote', { ...params, body: { value: next } }));
          patchTopicEverywhere(qc, inst, topic.id, (t) => ({ ...t, score: fresh.score, upvotes: fresh.upvotes, downvotes: fresh.downvotes, viewer: fresh.viewer ?? t.viewer }));
        } catch (e) {
          restore(topic.id, topic);
          throw e;
        }
      },
      /**
       * Records that the topic was opened. Signed out it goes to this device's record; offline (or
       * when the instance is unreachable) it waits in a queue and is sent later.
       */
      opened(topicId: string) {
        if (!inst) return;
        if (!signedIn) {
          feedReads.recordLocal(inst, topicId);
          return;
        }
        patchTopicEverywhere(qc, inst, topicId, withOpened);
        void api()
          .PUT('/topics/{topicID}/read', { params: { path: { topicID: topicId } } })
          .then(unwrap)
          .catch((e: unknown) => {
            if (isNetworkFailure(e)) feedReads.enqueue(inst, topicId);
          });
      },
      async markUnread(topic: TopicLike) {
        patchTopicEverywhere(qc, inst, topic.id, withUnread);
        try {
          unwrap(await api().DELETE('/topics/{topicID}/read', { params: { path: { topicID: topic.id } } }));
        } catch (e) {
          restore(topic.id, topic);
          throw e;
        }
      },
      async markRead(topic: TopicLike) {
        patchTopicEverywhere(qc, inst, topic.id, withOpened);
        try {
          unwrap(await api().PUT('/topics/{topicID}/read', { params: { path: { topicID: topic.id } } }));
        } catch (e) {
          restore(topic.id, topic);
          throw e;
        }
      },
      /** Marks a place (or a forum and what is under it) read, up to when the feed was loaded. */
      async markAllRead(place: { id: string; slug: string }, before: string, boardId?: string) {
        const res = unwrap(await api().POST('/places/{place}/feed/read', { params: { path: { place: place.slug } }, body: { before, board_id: boardId } }));
        applyMarkAll(qc, inst, place.id, before);
        return res.marked;
      },
      /** Marks loaded topics read, for feeds without a place-wide endpoint (Home). */
      async markTopicsRead(topicIds: string[], batchSize = DEFAULT_READ_BATCH) {
        for (const batch of batches(topicIds, batchSize)) {
          const states = unwrap(await api().POST('/feed/read', { body: { topic_ids: batch } })) ?? [];
          for (const s of states) applyReadState(qc, inst, s);
        }
      },
      async setVoting(slug: string, enabled: boolean) {
        const place = unwrap(await api().PATCH('/places/{place}', { params: { path: { place: slug } }, body: { voting_enabled: enabled } }));
        await Promise.all([qc.invalidateQueries({ queryKey: ['place', inst, slug] }), qc.invalidateQueries({ queryKey: feedKeys.all(inst) })]);
        return place;
      },
    };
  }, [client, inst, qc, signedIn]);
}

/**
 * Sends what waits on this device once it can: the signed-out read record right after signing in
 * (then forgets it), and opens queued while offline whenever the instance is reachable again.
 */
export function FeedSyncHost(): null {
  const active = useActiveInstance();
  const session = useSession();
  const live = useGatewayReady();
  const online = useOnline();
  const qc = useQueryClient();
  const { readBatch } = useFeedCapabilities();
  const inst = active?.id;
  const apiBaseUrl = active?.apiBaseUrl;
  const signedIn = !!session;
  const local = useStore(feedReads.store, (s) => (inst ? (s.local[inst]?.length ?? 0) : 0));
  const queued = useStore(feedReads.store, (s) => (inst ? (s.queue[inst]?.length ?? 0) : 0));

  useEffect(() => {
    if (inst) void feedReads.hydrate(inst);
  }, [inst]);

  useEffect(() => {
    if (!inst || !apiBaseUrl || !signedIn || !online || (local === 0 && queued === 0)) return;
    const client = authManager.clientFor({ id: inst, apiBaseUrl });
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const send = async (ids: string[]) => {
      for (const batch of batches(ids, readBatch)) {
        if (cancelled) return false;
        const states = unwrap(await client.POST('/feed/read', { body: { topic_ids: batch } })) ?? [];
        for (const s of states) applyReadState(qc, inst, s);
        // Topics that are gone or hidden come back without a state; they are done too.
        feedReads.ack(inst, batch);
      }
      return true;
    };
    const run = async () => {
      await feedReads.hydrate(inst);
      const state = feedReads.store.getState();
      try {
        const localIds = state.local[inst] ?? [];
        if (localIds.length && (await send(localIds)) && !cancelled) feedReads.clearLocal(inst);
        const queue = feedReads.store.getState().queue[inst] ?? [];
        if (queue.length) await send(queue);
      } catch (e) {
        if (cancelled) return;
        const f = classifyFailure(e);
        // Rate limited or unreachable: try again later. Anything else would fail again, so drop it.
        if (f.kind === 'rate_limited') timer = setTimeout(() => void run(), f.retryAfter * 1000);
        else if (f.kind !== 'network' && !(e instanceof ApiError && e.status >= 500)) {
          feedReads.clearLocal(inst);
          feedReads.ack(inst, feedReads.store.getState().queue[inst] ?? []);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [inst, apiBaseUrl, signedIn, online, live, local, queued, readBatch, qc]);

  return null;
}
