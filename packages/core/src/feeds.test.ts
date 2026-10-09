import { describe, expect, it } from 'vitest';

import {
  activeFilterCount,
  addLocalRead,
  availableSorts,
  batches,
  coveredByMarkAll,
  createFeedReadStore,
  DEFAULT_FEED_FILTERS,
  describeTopicReadState,
  dropSent,
  enqueueOpen,
  feedItemsOf,
  feedParams,
  feedQuery,
  formatScore,
  parseFeedParams,
  parseIdList,
  patchAllFeedItems,
  patchFeedPages,
  withAllRead,
  withOpened,
  withReadState,
  withUnread,
  withVote,
  type FeedTopic,
  type FeedPage,
  type FeedPages,
} from './feeds.ts';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const user = { id: ID(99), username: 'u', display_name: 'U', avatar_url: null, bio: '', pronouns: '', bot: false, created_at: '2026-01-01T00:00:00Z' };

function item(n: number, patch: Partial<FeedTopic> = {}): FeedTopic {
  return {
    id: ID(n),
    title: `Topic ${n}`,
    slug: `topic-${n}`,
    author: user,
    last_poster: user,
    board_id: ID(50),
    place_id: ID(60),
    board: { id: ID(50), slug: 'b', name: 'B', is_nsfw: false },
    place: { id: ID(60), slug: 'p', name: 'P', icon_url: null, is_nsfw: false, voting_enabled: true },
    excerpt: '',
    is_nsfw: false,
    is_archived: false,
    is_locked: false,
    is_pinned: false,
    tags: [],
    solution_post_id: null,
    post_count: 3,
    reply_count: 2,
    last_post_number: 3,
    last_post_at: '2026-10-01T12:00:00Z',
    created_at: '2026-10-01T10:00:00Z',
    score: 5,
    upvotes: 6,
    downvotes: 1,
    unread_count: 3,
    viewer: { read: false, has_new_replies: false, new_reply_count: 0, unread_count: 3, last_read_post_number: null, vote: 0, subscription: 'normal' },
    ...patch,
  } as FeedTopic;
}

const page = (items: FeedTopic[], extra: Partial<FeedPage> = {}): FeedPage => ({ items, as_of: '2026-10-02T00:00:00Z', sort: 'hot', ...extra });

describe('feed parameters', () => {
  it('round-trips through route parameters, leaving defaults out', () => {
    const f = { ...DEFAULT_FEED_FILTERS, sort: 'top' as const, window: 'month' as const, tag: 'glue', hideRead: true, pinnedFirst: true, board: ID(7), solved: 'false' as const };
    const params = feedParams(f);
    expect(params).toEqual({ sort: 'top', t: 'month', board: ID(7), tag: 'glue', solved: 'false', hide_read: '1', nsfw: undefined, pinned: 'first' });
    expect(parseFeedParams(params as Record<string, string>)).toEqual(f);
    expect(feedParams(DEFAULT_FEED_FILTERS)).toEqual({ sort: undefined, t: undefined, board: undefined, tag: undefined, solved: undefined, hide_read: undefined, nsfw: undefined, pinned: undefined });
  });

  it('ignores invalid values and windows on sorts without one', () => {
    expect(parseFeedParams({ sort: 'best', t: 'decade', board: 'nope', tag: 'Bad Tag!', solved: 'maybe' })).toEqual(DEFAULT_FEED_FILTERS);
    expect(parseFeedParams({ sort: 'new', t: 'week' }).window).toBeUndefined();
    expect(parseFeedParams({ tag: 'Glue' }).tag).toBe('glue');
  });

  it('falls back to a remembered sort only when the link names none', () => {
    const remembered = { sort: 'top' as const, window: 'year' as const };
    expect(parseFeedParams({}, remembered)).toMatchObject({ sort: 'top', window: 'year' });
    expect(parseFeedParams({ sort: 'top' }, remembered).window).toBeUndefined();
    expect(parseFeedParams({ sort: 'new' }, remembered).sort).toBe('new');
  });

  it('builds the API query for each scope', () => {
    const f = { ...DEFAULT_FEED_FILTERS, sort: 'controversial' as const, board: ID(1), pinnedFirst: true, nsfw: true };
    expect(feedQuery(f, 'place')).toEqual({ sort: 'controversial', t: 'week', tag: undefined, solved: undefined, hide_read: undefined, nsfw: true, board: ID(1), pinned: 'first' });
    expect(feedQuery(f, 'instance')).not.toHaveProperty('board');
    expect(feedQuery({ ...f, sort: 'hot' }, 'instance').t).toBeUndefined();
    expect(activeFilterCount(f)).toBe(3);
  });

  it('offers the advertised sorts, without controversial when voting is off', () => {
    expect(availableSorts(undefined, true)).toEqual(['hot', 'new', 'active', 'top', 'rising', 'controversial']);
    expect(availableSorts(['new', 'hot', 'future'], true)).toEqual(['hot', 'new']);
    expect(availableSorts(null, false)).not.toContain('controversial');
  });
});

describe('formatScore', () => {
  it('shortens large scores', () => {
    expect([0, 42, -7, 999, 1000, 1234, 1299, 9999, 12_345, -1500, 999_999, 1_250_000, 34_000_000].map(formatScore)).toEqual([
      '0', '42', '-7', '999', '1k', '1.2k', '1.2k', '9.9k', '12k', '-1.5k', '999k', '1.2M', '34M',
    ]);
  });
});

describe('read state', () => {
  it('describes unread, read and new replies', () => {
    expect(describeTopicReadState(item(1))).toEqual({ state: 'unread', newCount: 0, label: 'unread' });
    const read = item(1, { viewer: { read: true, has_new_replies: false, new_reply_count: 0, unread_count: 0, last_read_post_number: 3, vote: 0, subscription: 'normal' } });
    expect(describeTopicReadState(read).label).toBe('read');
    // Read position 1 of 4, opened when there were 2 posts: 3 unread, but only 2 new since the open.
    const fresh = item(1, { viewer: { read: true, has_new_replies: true, new_reply_count: 2, unread_count: 3, last_read_post_number: 1, vote: 0, subscription: 'normal' } });
    expect(describeTopicReadState(fresh)).toEqual({ state: 'new', newCount: 2, label: 'read, 2 new replies' });
    expect(describeTopicReadState({ ...fresh, viewer: { ...fresh.viewer!, new_reply_count: 1 } }).label).toBe('read, 1 new reply');
  });

  it('uses the local record when signed out', () => {
    const anon = item(1, { viewer: undefined });
    expect(describeTopicReadState(anon).state).toBe('unread');
    expect(describeTopicReadState(anon, true).state).toBe('read');
  });

  it('opens, marks unread, marks all read and applies server states', () => {
    const fresh = item(1, { viewer: { read: true, has_new_replies: true, new_reply_count: 2, unread_count: 2, last_read_post_number: 1, vote: 0, subscription: 'normal' } });
    const opened = withOpened(fresh);
    expect(opened.viewer).toMatchObject({ read: true, has_new_replies: false, new_reply_count: 0, last_read_post_number: 1 });
    expect(withOpened(opened)).toBe(opened);
    expect(withOpened(item(1)).viewer?.last_read_post_number).toBe(1);
    expect(withUnread(opened).viewer).toMatchObject({ read: false, last_read_post_number: 1 });
    expect(withAllRead(item(1))).toMatchObject({ unread_count: 0, last_read_post_number: 3, viewer: { read: true, unread_count: 0, last_read_post_number: 3 } });
    const applied = withReadState(item(1), { topic_id: ID(1), place_id: ID(60), read: true, has_new_replies: true, new_reply_count: 1, unread_count: 1, last_read_post_number: 2 });
    expect(applied).toMatchObject({ unread_count: 1, last_read_post_number: 2, viewer: { read: true, has_new_replies: true, new_reply_count: 1, unread_count: 1, last_read_post_number: 2 } });
    expect(withOpened(item(1, { viewer: undefined })).viewer).toBeUndefined();
  });
});

describe('withVote', () => {
  it('moves the score and counts with every change', () => {
    const t = item(1);
    const up = withVote(t, 1);
    expect(up).toMatchObject({ score: 6, upvotes: 7, downvotes: 1, viewer: { vote: 1 } });
    const down = withVote(up, -1);
    expect(down).toMatchObject({ score: 4, upvotes: 6, downvotes: 2, viewer: { vote: -1 } });
    expect(withVote(down, 0)).toMatchObject({ score: 5, upvotes: 6, downvotes: 1, viewer: { vote: 0 } });
    expect(withVote(t, 0)).toBe(t);
  });
});

describe('feed pages', () => {
  const data = (): FeedPages => ({
    pages: [page([item(1), item(2)], { pinned: [item(9, { is_pinned: true })] }), page([item(2), item(3)])],
    pageParams: [null, 'c1'],
  });

  it('keeps pinned topics first and drops repeats across pages', () => {
    const { pinned, items } = feedItemsOf(data().pages);
    expect(pinned.map((p) => p.title)).toEqual(['Topic 9']);
    expect(items.map((p) => p.title)).toEqual(['Topic 1', 'Topic 2', 'Topic 3']);
    expect(feedItemsOf(undefined)).toEqual({ pinned: [], items: [] });
  });

  it('patches every copy of a topic, and nothing when it is absent', () => {
    const d = data();
    const patched = patchFeedPages(d, ID(2), (it) => withVote(it, 1))!;
    expect(patched.pages[0]!.items![1]!.score).toBe(6);
    expect(patched.pages[1]!.items![0]!.score).toBe(6);
    expect(patched.pages[0]!.items![0]).toBe(d.pages[0]!.items![0]);
    expect(patchFeedPages(d, ID(9), (it) => ({ ...it, title: 'x' }))!.pages[0]!.pinned![0]!.title).toBe('x');
    expect(patchFeedPages(d, ID(42), (it) => ({ ...it, title: 'x' }))).toBe(d);
    expect(patchFeedPages(undefined, ID(1), (it) => it)).toBeUndefined();
    const all = patchAllFeedItems(d, withAllRead)!;
    expect(all.pages.flatMap((p) => p.items ?? []).every((it) => it.viewer?.read)).toBe(true);
  });

  it('knows which topics mark-all-read covers', () => {
    expect(coveredByMarkAll(item(1), '2026-10-01T12:00:00Z')).toBe(true);
    expect(coveredByMarkAll(item(1), '2026-10-01T11:59:59Z')).toBe(false);
  });
});

describe('read record and queue', () => {
  it('keeps the newest opens up to the cap', () => {
    let r: string[] = [];
    for (const n of [1, 2, 3, 2, 4]) r = addLocalRead(r, ID(n), 3);
    expect(r).toEqual([ID(3), ID(2), ID(4)]);
  });

  it('queues each topic once and drops what was sent', () => {
    let q: string[] = [];
    for (const n of [1, 2, 1, 3]) q = enqueueOpen(q, ID(n));
    expect(q).toEqual([ID(1), ID(2), ID(3)]);
    expect(dropSent(q, [ID(1), ID(3)])).toEqual([ID(2)]);
    expect(batches(q, 2)).toEqual([[ID(1), ID(2)], [ID(3)]]);
    expect(batches([], 2)).toEqual([]);
  });

  it('parses stored lists defensively', () => {
    expect(parseIdList(JSON.stringify([ID(1), 'nope', 3]))).toEqual([ID(1)]);
    expect(parseIdList('{')).toEqual([]);
    expect(parseIdList(null)).toEqual([]);
  });

  it('persists per instance and keeps what was recorded before hydration', async () => {
    const mem = new Map<string, string>([['gotalk.feed.local.a', JSON.stringify([ID(1)])]]);
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    const rs = createFeedReadStore(storage, 3);
    rs.recordLocal('a', ID(2));
    await rs.hydrate('a');
    expect(rs.store.getState().local.a).toEqual([ID(1), ID(2)]);
    expect(rs.store.getState().hydrated.a).toBe(true);
    rs.enqueue('a', ID(5));
    rs.enqueue('a', ID(6));
    rs.ack('a', [ID(5)]);
    expect(JSON.parse(mem.get('gotalk.feed.queue.a')!)).toEqual([ID(6)]);
    rs.clearLocal('a');
    expect(mem.has('gotalk.feed.local.a')).toBe(false);
    expect(rs.store.getState().local.b).toBeUndefined();
  });
});
