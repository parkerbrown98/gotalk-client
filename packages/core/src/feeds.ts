import type { Schemas } from '@gotalk/api-client';
import { createStore, type StoreApi } from 'zustand/vanilla';

import type { KeyValueStorage } from './instances.ts';

export type FeedTopic = Schemas['FeedItem'];
export type FeedPage = Schemas['FeedPage'];
export type TopicViewer = Schemas['TopicViewer'];
export type TopicReadState = Schemas['TopicReadState'];

export const FEED_SORTS = ['hot', 'new', 'active', 'top', 'rising', 'controversial'] as const;
export type FeedSort = (typeof FEED_SORTS)[number];
export const FEED_WINDOWS = ['hour', 'day', 'week', 'month', 'year', 'all'] as const;
export type FeedWindow = (typeof FEED_WINDOWS)[number];
export type FeedScope = 'home' | 'all';

export const feedSortLabels: Record<FeedSort, string> = {
  hot: 'Hot',
  new: 'New',
  active: 'Active',
  top: 'Top',
  rising: 'Rising',
  controversial: 'Controversial',
};

export const feedSortHints: Record<FeedSort, string> = {
  hot: 'Score and replies weighed against age',
  new: 'Newest topics first',
  active: 'Latest reply first',
  top: 'Highest score in a time window',
  rising: 'Gaining votes and replies fastest, last 48 hours',
  controversial: 'Many votes, split between up and down',
};

export const feedWindowLabels: Record<FeedWindow, string> = {
  hour: 'Past hour',
  day: 'Today',
  week: 'This week',
  month: 'This month',
  year: 'This year',
  all: 'All time',
};

/** The server's default window for top and controversial. */
export const DEFAULT_FEED_WINDOW: FeedWindow = 'week';

export interface FeedFilters {
  sort: FeedSort;
  /** Only for top and controversial. */
  window?: FeedWindow;
  /** A board or category; place feeds only. */
  board?: string;
  tag?: string;
  solved?: 'true' | 'false';
  hideRead: boolean;
  nsfw: boolean;
  /** Pinned topics first; place feeds only. */
  pinnedFirst: boolean;
}

export const DEFAULT_FEED_FILTERS: FeedFilters = { sort: 'hot', hideRead: false, nsfw: false, pinnedFirst: false };

export function sortUsesWindow(sort: FeedSort): boolean {
  return sort === 'top' || sort === 'controversial';
}

const TAG = /^[a-z0-9][a-z0-9-]{0,31}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function isOne<T extends string>(list: readonly T[], v: string | undefined): v is T {
  return v !== undefined && (list as readonly string[]).includes(v);
}

/**
 * Feed filters from route parameters. Anything missing or invalid falls back to `base` (for example
 * the sort remembered for this feed), then to the defaults.
 */
export function parseFeedParams(params: Params, base: Partial<FeedFilters> = {}): FeedFilters {
  const sortParam = first(params.sort);
  const sort: FeedSort = isOne(FEED_SORTS, sortParam) ? sortParam : (base.sort ?? DEFAULT_FEED_FILTERS.sort);
  const t = first(params.t);
  const window = sortUsesWindow(sort) ? (isOne(FEED_WINDOWS, t) ? t : sortParam ? undefined : base.window) : undefined;
  const board = first(params.board);
  const tag = first(params.tag)?.trim().toLowerCase();
  const solved = first(params.solved);
  const flag = (key: string, fallback: boolean) => {
    const v = first(params[key]);
    return v === undefined ? fallback : v === '1' || v === 'true';
  };
  return {
    sort,
    window,
    board: board && UUID.test(board) ? board : undefined,
    tag: tag && TAG.test(tag) ? tag : undefined,
    solved: solved === 'true' || solved === 'false' ? solved : undefined,
    hideRead: flag('hide_read', base.hideRead ?? false),
    nsfw: flag('nsfw', base.nsfw ?? false),
    pinnedFirst: first(params.pinned) === undefined ? (base.pinnedFirst ?? false) : first(params.pinned) === 'first',
  };
}

/** Route parameters for filters. Defaults are left out (as undefined) so links stay short. */
export function feedParams(f: FeedFilters): Record<string, string | undefined> {
  return {
    sort: f.sort === DEFAULT_FEED_FILTERS.sort ? undefined : f.sort,
    t: sortUsesWindow(f.sort) && f.window ? f.window : undefined,
    board: f.board,
    tag: f.tag,
    solved: f.solved,
    hide_read: f.hideRead ? '1' : undefined,
    nsfw: f.nsfw ? '1' : undefined,
    pinned: f.pinnedFirst ? 'first' : undefined,
  };
}

/** The API query for a feed page (without the cursor). */
export function feedQuery(f: FeedFilters, scope: 'place' | 'instance') {
  return {
    sort: f.sort,
    t: sortUsesWindow(f.sort) ? (f.window ?? DEFAULT_FEED_WINDOW) : undefined,
    tag: f.tag,
    solved: f.solved,
    hide_read: f.hideRead || undefined,
    nsfw: f.nsfw || undefined,
    ...(scope === 'place' ? { board: f.board, pinned: f.pinnedFirst ? ('first' as const) : undefined } : {}),
  };
}

/** How many filters beyond the sort are on, for the Filters button. */
export function activeFilterCount(f: FeedFilters): number {
  return [f.board, f.tag, f.solved, f.hideRead, f.nsfw, f.pinnedFirst].filter(Boolean).length;
}

/**
 * Sorts to offer: those the instance advertises (all known ones when it does not say), without
 * controversial when votes are off.
 */
export function availableSorts(advertised: readonly string[] | null | undefined, votingEnabled: boolean): FeedSort[] {
  const known = advertised?.length ? FEED_SORTS.filter((s) => advertised.includes(s)) : [...FEED_SORTS];
  return votingEnabled ? known : known.filter((s) => s !== 'controversial');
}

/** "42", "1.2k", "12k", "3.4M"; negative scores keep their sign. */
export function formatScore(n: number): string {
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  const short = (v: number, unit: string) => {
    const fixed = v < 10 ? (Math.floor(v * 10) / 10).toFixed(1).replace(/\.0$/, '') : String(Math.floor(v));
    return `${sign}${fixed}${unit}`;
  };
  if (a < 1000) return String(n);
  if (a < 1_000_000) return short(a / 1000, 'k');
  return short(a / 1_000_000, 'M');
}

type WithViewer = Pick<FeedTopic, 'viewer' | 'unread_count' | 'last_read_post_number' | 'reply_count' | 'last_post_number'>;

export interface TopicReadDescription {
  state: 'unread' | 'read' | 'new';
  /** Replies since the last open. */
  newCount: number;
  /** For screen readers: "unread", "read" or "read, 3 new replies". */
  label: string;
}

/**
 * The read state a row shows. Signed out there is no viewer object; `locallyRead` is this
 * device's record of what was opened.
 */
export function describeTopicReadState(topic: WithViewer, locallyRead = false): TopicReadDescription {
  const v = topic.viewer;
  if (!v) return locallyRead ? { state: 'read', newCount: 0, label: 'read' } : { state: 'unread', newCount: 0, label: 'unread' };
  if (!v.read) return { state: 'unread', newCount: 0, label: 'unread' };
  if (!v.has_new_replies) return { state: 'read', newCount: 0, label: 'read' };
  const n = Math.max(1, v.new_reply_count);
  return { state: 'new', newCount: n, label: `read, ${n} new ${n === 1 ? 'reply' : 'replies'}` };
}

type Votable = Pick<FeedTopic, 'score' | 'upvotes' | 'downvotes' | 'viewer'>;

function viewerOf(v: TopicViewer | undefined): TopicViewer {
  return v ?? { read: false, has_new_replies: false, new_reply_count: 0, unread_count: 0, last_read_post_number: null, vote: 0, subscription: 'normal' };
}

/** The topic as it will look after the caller's vote changes to `next` (1, -1, or 0 to clear). */
export function withVote<T extends Votable>(topic: T, next: -1 | 0 | 1): T {
  const prev = topic.viewer?.vote ?? 0;
  if (prev === next) return topic;
  const up = topic.upvotes + (next === 1 ? 1 : 0) - (prev === 1 ? 1 : 0);
  const down = topic.downvotes + (next === -1 ? 1 : 0) - (prev === -1 ? 1 : 0);
  return { ...topic, upvotes: up, downvotes: down, score: topic.score + (next - prev), viewer: { ...viewerOf(topic.viewer), vote: next } };
}

/** The topic as it will look once opened: read, with nothing new since. */
export function withOpened<T extends WithViewer>(topic: T): T {
  if (!topic.viewer) return topic;
  const v = topic.viewer;
  if (v.read && !v.has_new_replies) return topic;
  return { ...topic, viewer: { ...v, read: true, has_new_replies: false, new_reply_count: 0, last_read_post_number: Math.max(v.last_read_post_number ?? 0, 1) } };
}

/** The topic after "Mark as unread": not opened, read position kept. */
export function withUnread<T extends WithViewer>(topic: T): T {
  if (!topic.viewer) return topic;
  return { ...topic, viewer: { ...topic.viewer, read: false, has_new_replies: false, new_reply_count: 0 } };
}

/** The topic fully read, as after "Mark all as read". */
export function withAllRead<T extends WithViewer>(topic: T): T {
  if (!topic.viewer) return topic;
  return {
    ...topic,
    unread_count: 0,
    last_read_post_number: topic.last_post_number,
    viewer: { ...topic.viewer, read: true, has_new_replies: false, new_reply_count: 0, unread_count: 0, last_read_post_number: topic.last_post_number },
  };
}

/** Applies a read state from the server (a REST answer or a gateway event). */
export function withReadState<T extends WithViewer>(topic: T, s: TopicReadState): T {
  const last = s.last_read_post_number ?? undefined;
  return {
    ...topic,
    unread_count: topic.unread_count === undefined ? undefined : s.unread_count,
    last_read_post_number: last,
    viewer: { ...viewerOf(topic.viewer), read: s.read, has_new_replies: s.has_new_replies, new_reply_count: s.new_reply_count, unread_count: s.unread_count, last_read_post_number: s.last_read_post_number },
  };
}

export interface FeedPages {
  pages: FeedPage[];
  pageParams: unknown[];
}

/** Applies `patch` to every copy of a topic in loaded feed pages (items and pinned). */
export function patchFeedPages<D extends FeedPages>(data: D | undefined, topicId: string, patch: (item: FeedTopic) => FeedTopic): D | undefined {
  if (!data) return data;
  let changed = false;
  const apply = (list: FeedTopic[] | null | undefined) =>
    list?.map((it) => {
      if (it.id !== topicId) return it;
      const next = patch(it);
      if (next !== it) changed = true;
      return next;
    }) ?? list;
  const pages = data.pages.map((p) => ({ ...p, items: apply(p.items) ?? null, pinned: apply(p.pinned) }));
  return changed ? { ...data, pages } : data;
}

/** Applies `patch` to every loaded item of a feed. */
export function patchAllFeedItems<D extends FeedPages>(data: D | undefined, patch: (item: FeedTopic) => FeedTopic): D | undefined {
  if (!data) return data;
  const apply = (list: FeedTopic[] | null | undefined) => list?.map(patch) ?? list;
  return { ...data, pages: data.pages.map((p) => ({ ...p, items: apply(p.items) ?? null, pinned: apply(p.pinned) })) };
}

/**
 * The topics to show from loaded pages: pinned ones (first page), then ranked ones. A topic whose
 * score changed while paging can come back on a later page; only its first appearance is kept.
 */
export function feedItemsOf(pages: readonly FeedPage[] | undefined): { pinned: FeedTopic[]; items: FeedTopic[] } {
  const pinned = pages?.[0]?.pinned ?? [];
  const seen = new Set(pinned.map((p) => p.id));
  const items: FeedTopic[] = [];
  for (const page of pages ?? []) {
    for (const it of page.items ?? []) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      items.push(it);
    }
  }
  return { pinned, items };
}

/** Topics a place-wide "Mark all as read" covers: those last active at or before `before`. */
export function coveredByMarkAll(item: Pick<FeedTopic, 'last_post_at'>, before: string): boolean {
  return new Date(item.last_post_at).getTime() <= new Date(before).getTime();
}

// ---- Read record (signed out) and open queue (offline) ----

/** Topics remembered as opened on this device while signed out. */
export const LOCAL_READ_CAP = 2000;

/** Adds an opened topic to the record, newest last, dropping the oldest past the cap. */
export function addLocalRead(record: readonly string[], topicId: string, cap = LOCAL_READ_CAP): string[] {
  const next = record.filter((id) => id !== topicId);
  next.push(topicId);
  return next.length > cap ? next.slice(next.length - cap) : next;
}

/** Queues an open to send; each topic is sent once however often it was opened. */
export function enqueueOpen(queue: readonly string[], topicId: string): string[] {
  return queue.includes(topicId) ? [...queue] : [...queue, topicId];
}

/** Removes the topics that were sent (or rejected for good) from the queue. */
export function dropSent(queue: readonly string[], sent: readonly string[]): string[] {
  const done = new Set(sent);
  return queue.filter((id) => !done.has(id));
}

/** Splits IDs into batches the server accepts. */
export function batches(ids: readonly string[], size: number): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += Math.max(1, size)) out.push(ids.slice(i, i + Math.max(1, size)));
  return out;
}

export function parseIdList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && UUID.test(x)) : [];
  } catch {
    return [];
  }
}

export interface FeedReadState {
  /** Per instance: topics opened while signed out. */
  local: Record<string, string[]>;
  /** Per instance: opens made while signed in that the server has not acknowledged yet. */
  queue: Record<string, string[]>;
  hydrated: Record<string, boolean>;
}

export interface FeedReadStore {
  store: StoreApi<FeedReadState>;
  hydrate(instanceId: string): Promise<void>;
  recordLocal(instanceId: string, topicId: string): void;
  clearLocal(instanceId: string): void;
  enqueue(instanceId: string, topicId: string): void;
  ack(instanceId: string, sent: readonly string[]): void;
}

const localKey = (inst: string) => `gotalk.feed.local.${inst}`;
const queueKey = (inst: string) => `gotalk.feed.queue.${inst}`;

/** Keeps the signed-out read record and the offline open queue per instance, persisted in `storage`. */
export function createFeedReadStore(storage: KeyValueStorage, cap = LOCAL_READ_CAP): FeedReadStore {
  const store = createStore<FeedReadState>(() => ({ local: {}, queue: {}, hydrated: {} }));
  const loading = new Map<string, Promise<void>>();
  const save = (key: string, ids: string[]) => {
    void Promise.resolve(ids.length ? storage.setItem(key, JSON.stringify(ids)) : storage.removeItem(key)).catch(() => undefined);
  };
  const update = (inst: string, kind: 'local' | 'queue', next: string[]) => {
    store.setState((s) => ({ ...s, [kind]: { ...s[kind], [inst]: next } }));
    // Until the stored lists are read, writing would replace them; hydration saves the merge.
    if (store.getState().hydrated[inst]) save(kind === 'local' ? localKey(inst) : queueKey(inst), next);
  };
  return {
    store,
    hydrate(inst) {
      let p = loading.get(inst);
      if (!p) {
        p = Promise.all([Promise.resolve(storage.getItem(localKey(inst))), Promise.resolve(storage.getItem(queueKey(inst)))])
          .catch(() => [null, null] as const)
          .then(([local, queue]) => {
            // Anything recorded before hydration finished is kept on top of what was stored.
            store.setState((s) => ({
              local: { ...s.local, [inst]: (s.local[inst] ?? []).reduce((r, id) => addLocalRead(r, id, cap), parseIdList(local)) },
              queue: { ...s.queue, [inst]: (s.queue[inst] ?? []).reduce(enqueueOpen, parseIdList(queue)) },
              hydrated: { ...s.hydrated, [inst]: true },
            }));
            const merged = store.getState();
            save(localKey(inst), merged.local[inst] ?? []);
            save(queueKey(inst), merged.queue[inst] ?? []);
          });
        loading.set(inst, p);
      }
      return p;
    },
    recordLocal(inst, id) {
      update(inst, 'local', addLocalRead(store.getState().local[inst] ?? [], id, cap));
    },
    clearLocal(inst) {
      update(inst, 'local', []);
    },
    enqueue(inst, id) {
      update(inst, 'queue', enqueueOpen(store.getState().queue[inst] ?? [], id));
    },
    ack(inst, sent) {
      update(inst, 'queue', dropSent(store.getState().queue[inst] ?? [], sent));
    },
  };
}
